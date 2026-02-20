// Google Calendar APIとNotionの同期スクリプト

// スプレッドシートから設定値を取得するための関数
function getSettingValue(cellAddress) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Control');
  return sheet.getRange(cellAddress).getValue();
}

// ユーザーにエラーメッセージを表示するための関数
function showError(message) {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.alert('エラーが発生しました', message, ui.ButtonSet.OK);
  } catch (e) {
    // トリガーから実行された場合、UIにアクセスできないため、エラーメッセージをログに記録します
    console.error('エラーが発生しました:', message);
    // 必要に応じて、メールで通知することも可能です（後述）
  }
}

// Notionの統合トークンとデータベースIDを設定
const NOTION_TOKEN = getSettingValue('C5');
const NOTION_DATABASE_ID = getSettingValue('C6');

// ユーザー設定可能な項目
const EVENT_IDS = getSettingValue('C7') || 'primary';
const eventIds = EVENT_IDS.split(',').map(id => id.trim()).filter(id => id);
const SYNC_DAYS_FUTURE = parseInt(getSettingValue('C8') || '30');
const SYNC_FREQUENCY_MINUTES = parseInt(getSettingValue('C9') || '5');
const PERFORM_INITIAL_SYNC = getSettingValue('C10').toString().toLowerCase() === 'true';

// 同期の状態を管理するためのプロパティキー
const LAST_SYNC_TIMESTAMP_KEY = 'lastSyncTimestamp';
const IS_INITIAL_SYNC_COMPLETED_KEY = 'isInitialSyncCompleted';
const EVENT_INDEX_KEY = 'eventIndex'; // イベントの進捗を管理

// 必要なデータベースプロパティを定義
const requiredProperties = {
  '日付': { date: {} },
  'イベントID': { rich_text: {} },
  '最終更新日時(GAS)': { date: {} }
};

// Notionページの取得や更新に使用するメソッド群
const notion = {
  createPage: (data) => {
    const options = {
      method: 'post',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify({
        parent: { database_id: NOTION_DATABASE_ID },
        properties: data
      }),
    };
    const response = UrlFetchApp.fetch('https://api.notion.com/v1/pages', options);
    return JSON.parse(response.getContentText());
  },

  updatePage: (pageId, data) => {
    const options = {
      method: 'patch',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify({ properties: data }),
    };
    const response = UrlFetchApp.fetch(`https://api.notion.com/v1/pages/${pageId}`, options);
    return JSON.parse(response.getContentText());
  },

  archivePage: (pageId) => {
    const options = {
      method: 'patch',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify({ archived: true }),
    };
    const response = UrlFetchApp.fetch(`https://api.notion.com/v1/pages/${pageId}`, options);
    return JSON.parse(response.getContentText());
  },

  queryDatabase: (filter) => {
    const options = {
      method: 'post',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify({ filter: filter }),
    };
    const response = UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, options);
    return JSON.parse(response.getContentText()).results;
  },

  getDatabase: () => {
    const options = {
      method: 'get',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
      },
    };
    const response = UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}`, options);
    return JSON.parse(response.getContentText());
  },

  updateDatabase: (data) => {
    const options = {
      method: 'patch',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify(data),
    };
    const response = UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}`, options);
    return JSON.parse(response.getContentText());
  },
};

// データベースのプロパティを確認・作成する関数
function ensureDatabaseProperties() {
  const database = notion.getDatabase();
  const existingProperties = database.properties;

  let propertiesToUpdate = {};

  for (const [propName, propValue] of Object.entries(requiredProperties)) {
    if (!existingProperties.hasOwnProperty(propName)) {
      propertiesToUpdate[propName] = propValue;
    }
  }

  if (Object.keys(propertiesToUpdate).length > 0) {
    notion.updateDatabase({ properties: propertiesToUpdate });
  }
}

// 処理を再スケジュールする関数
function scheduleNextRun() {
  // 既存の 'onSyncButtonClick' トリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  for (let trigger of triggers) {
    if (trigger.getHandlerFunction() === 'onSyncButtonClick') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  // 新しいトリガーを設定
  ScriptApp.newTrigger('onSyncButtonClick')
    .timeBased()
    .after(1 * 60 * 1000) // 1分後に実行
    .create();
}

// Google Calendar APIを使用してイベントを取得する関数
// options.updatedMin: 増分同期時に指定。この時刻以降に変更されたイベントのみ取得
function getCalendarEvents(eventIds, startTime, endTime, options = {}) {
  let events = [];
  for (const eventId of eventIds) {
    let pageToken;
    do {
      const params = {
        singleEvents: true,
        timeMax: endTime.toISOString(),
        pageToken: pageToken
      };

      if (startTime) {
        params.timeMin = startTime.toISOString();
      }

      if (options.updatedMin) {
        // 増分同期: 前回同期以降に変更されたイベントのみ取得（削除含む）
        params.updatedMin = options.updatedMin.toISOString();
        params.showDeleted = true;
        // orderBy: 'startTime' は削除イベント（startなし）と相性が悪いため省略
      } else {
        // 初期同期: 開始時刻順で取得
        params.orderBy = 'startTime';
      }

      const response = Calendar.Events.list(eventId, params);

      events = events.concat(response.items.map(event => ({ ...event, eventId })));
      pageToken = response.nextPageToken;
    } while (pageToken);

    console.log(`取得イベント数 (${eventId}): ${events.length}`);
  }
  return events;
}


// GoogleカレンダーのイベントをNotionのフォーマットに変換
function convertEventToNotionFormat(event) {
  const start = event.start.dateTime || event.start.date;
  const end = event.end.dateTime || event.end.date;

  // 終日イベントの場合は同期しない（終日イベントは start.date が存在し、start.dateTime が存在しない）
  if (event.start && event.start.date && !event.start.dateTime) {
    console.log(`終日の予定 "${event.summary}" をスキップしました。`);
    return null;
  }

  // イベントタイトルが '---' で始まる場合は同期しない
  if (event.summary && event.summary.startsWith('---')) {
    console.log(`イベント '${event.summary}' をスキップしました。`);
    return null;
  }

  return {
    'Name': {
      title: [{ text: { content: event.summary || 'No Title' } }]
    },
    '日付': {
      date: {
        start: start,
        end: end
      }
    },
    'イベントID': {
      rich_text: [{ text: { content: event.id } }]
    },
    '最終更新日時(GAS)': {
      date: { start: event.updated }
    }
  };
}

// 同期プロセスのメイン関数
function syncCalendarToNotion() {
  let errorMessages = [];
  try {
    ensureDatabaseProperties(); // 必要なデータベースプロパティを確認・作成

    const props = PropertiesService.getScriptProperties();
    const isInitialSyncCompleted = props.getProperty(IS_INITIAL_SYNC_COMPLETED_KEY) === 'true';
    const isInitialSyncInProgress = props.getProperty(EVENT_INDEX_KEY) !== null;

    if (!isInitialSyncCompleted && PERFORM_INITIAL_SYNC) {
      performInitialSync(errorMessages);
      if (props.getProperty(EVENT_INDEX_KEY) === null) {
        // 初期同期が完了した場合
        props.setProperty(IS_INITIAL_SYNC_COMPLETED_KEY, 'true');
        setUpTrigger();
      } else {
        // 初期同期がまだ進行中の場合、処理を再スケジュール
        scheduleNextRun();
      }
    } else if (!isInitialSyncCompleted && isInitialSyncInProgress) {
      // 初期同期が進行中の場合、増分同期をスキップ
      scheduleNextRun();
    } else {
      performIncrementalSync(errorMessages);
    }
  } catch (error) {
    errorMessages.push(`同期プロセス中にエラーが発生しました: ${error.message}`);
  }

  if (errorMessages.length > 0) {
    showError(errorMessages.join('\n'));
  } else {
    try {
      const ui = SpreadsheetApp.getUi();
      ui.alert('同期が完了しました。');
    } catch (e) {
      // トリガーから実行された場合、UIにアクセスできないため、ログに記録します
      console.log('同期が完了しました。');
    }
  }
}

// 初期同期プロセス（ロック機構を追加）
function performInitialSync(errorMessages) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { // 最大5秒待機してロックを取得
    errorMessages.push('他の同期プロセスが実行中のため、初期同期を開始できませんでした。後でもう一度お試しください。');
    return;
  }
  try {
    const now = new Date();
    const futureDate = new Date(now.getTime() + SYNC_DAYS_FUTURE * 24 * 60 * 60 * 1000);

    const props = PropertiesService.getScriptProperties();
    let eventIndex = parseInt(props.getProperty(EVENT_INDEX_KEY) || '0');

    // 初期同期: updatedMin不要、開始時刻順で全イベント取得
    const allEvents = getCalendarEvents(eventIds, now, futureDate);

    const batchSize = 50; // 一度に処理するイベント数
    const maxExecutionTime = 5 * 60 * 1000; // 最大実行時間（ミリ秒）
    const startTime = new Date().getTime();

    while (eventIndex < allEvents.length) {
      const elapsedTime = new Date().getTime() - startTime;
      if (elapsedTime > maxExecutionTime - 30 * 1000) { // 残り30秒で中断
        props.setProperty(EVENT_INDEX_KEY, eventIndex.toString());
        scheduleNextRun(); // 処理を再スケジュール
        return;
      }

      const batchEvents = allEvents.slice(eventIndex, eventIndex + batchSize);
      for (const event of batchEvents) {
        const notionData = convertEventToNotionFormat(event);
        if (notionData) {
          try {
            notion.createPage(notionData);
          } catch (error) {
            errorMessages.push(`イベントの追加中にエラーが発生しました: ${event.summary} - ${error.message}`);
          }
        }
      }
      eventIndex += batchSize;
    }

    // 全てのイベントが処理完了
    props.deleteProperty(EVENT_INDEX_KEY);
    props.setProperty(LAST_SYNC_TIMESTAMP_KEY, now.toISOString());
  } finally {
    lock.releaseLock();
  }
}

// 増分同期プロセス（ロック機構を追加）
function performIncrementalSync(errorMessages) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { // 最大5秒待機してロックを取得
    // ロックを取得できなかった場合、増分同期をスキップ
    return;
  }
  try {
    const props = PropertiesService.getScriptProperties();
    const lastSyncTimestampStr = props.getProperty(LAST_SYNC_TIMESTAMP_KEY);
    const lastSyncTimestamp = lastSyncTimestampStr ? new Date(lastSyncTimestampStr) : new Date(0);
    const now = new Date();
    const futureDate = new Date(now.getTime() + SYNC_DAYS_FUTURE * 24 * 60 * 60 * 1000);

    let eventIndex = parseInt(props.getProperty(EVENT_INDEX_KEY) || '0');

    // updatedMinで前回同期以降の変更のみ取得（削除・更新・新規すべて検知）
    const allEvents = getCalendarEvents(eventIds, null, futureDate, { updatedMin: lastSyncTimestamp });

    const batchSize = 50; // 一度に処理するイベント数
    const maxExecutionTime = 5 * 60 * 1000; // 最大実行時間（ミリ秒）
    const startTime = new Date().getTime();

    while (eventIndex < allEvents.length) {
      const elapsedTime = new Date().getTime() - startTime;
      if (elapsedTime > maxExecutionTime - 30 * 1000) { // 残り30秒で中断
        props.setProperty(EVENT_INDEX_KEY, eventIndex.toString());
        scheduleNextRun(); // 処理を再スケジュール
        return;
      }

      const batchEvents = allEvents.slice(eventIndex, eventIndex + batchSize);
      for (const event of batchEvents) {
        if (event.status === 'cancelled') {
          handleDeletedEvent(event);
        } else {
          syncEvent(event);
        }
      }
      eventIndex += batchSize;
    }

    // 全てのイベントが処理完了
    props.deleteProperty(EVENT_INDEX_KEY);
    props.setProperty(LAST_SYNC_TIMESTAMP_KEY, now.toISOString());
  } finally {
    lock.releaseLock();
  }
}

// 個別のイベント同期
function syncEvent(event) {
  const notionData = convertEventToNotionFormat(event);
  if (!notionData) return;

  const existingPages = notion.queryDatabase({
    and: [
      {
        property: 'イベントID',
        rich_text: { equals: event.id }
      }
    ]
  });

  if (existingPages.length > 0) {
    notion.updatePage(existingPages[0].id, notionData);
  } else {
    notion.createPage(notionData);
  }
}

// 削除されたイベントを処理する関数
function handleDeletedEvent(event) {
  const existingPages = notion.queryDatabase({
    and: [
      {
        property: 'イベントID',
        rich_text: { equals: event.id }
      }
    ]
  });

  if (existingPages.length > 0) {
    notion.archivePage(existingPages[0].id);
  }
}

// エラーハンドリングとリトライのユーティリティ関数
function withRetry(func, maxRetries = 3, delay = 1000) {
  return function (...args) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return func.apply(this, args);
      } catch (error) {
        lastError = error;
        Utilities.sleep(delay * Math.pow(2, i));  // 指数バックオフ
      }
    }
    throw lastError;
  };
}

// リトライ機能を適用
notion.createPage = withRetry(notion.createPage);
notion.updatePage = withRetry(notion.updatePage);
notion.archivePage = withRetry(notion.archivePage);
notion.queryDatabase = withRetry(notion.queryDatabase);
notion.getDatabase = withRetry(notion.getDatabase);
notion.updateDatabase = withRetry(notion.updateDatabase);

// ボタンから実行される関数（修正版：必ずトリガーを作るように変更）
function onSyncButtonClick() {
  // 1. まず強制的に定期実行トリガーをセットアップする
  setUpTrigger();

  // 2. ユーザーに通知
  try {
    const ui = SpreadsheetApp.getUi();
    ui.alert('定期実行スケジュールを再設定し、同期を開始します。');
  } catch (e) {
    console.log('UI表示エラー');
  }

  // 3. 同期処理を即時実行
  syncCalendarToNotion();
}

// Google Apps Scriptのトリガーを設定するための関数
function setUpTrigger() {
  // 既存の 'onSyncButtonClick' トリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  for (let trigger of triggers) {
    if (trigger.getHandlerFunction() === 'onSyncButtonClick') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  // 新しいトリガーを設定
  ScriptApp.newTrigger('onSyncButtonClick')
    .timeBased()
    .everyMinutes(SYNC_FREQUENCY_MINUTES)
    .create();
}

// 初期同期を手動で再実行するための関数
function manualInitialSync() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(IS_INITIAL_SYNC_COMPLETED_KEY, 'false');
  props.setProperty('PERFORM_INITIAL_SYNC', 'true');
  props.deleteProperty(EVENT_INDEX_KEY); // 進捗をリセット
  syncCalendarToNotion();
}

// スクリプトプロパティとトリガーをリセットする関数
function resetSettings() {
  // スクリプトプロパティを削除
  PropertiesService.getScriptProperties().deleteAllProperties();

  // このスクリプトに関連付けられたすべてのトリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    ScriptApp.deleteTrigger(trigger);
  }

  // ユーザーにリセット完了を通知
  SpreadsheetApp.getUi().alert('スクリプトの設定とトリガーをリセットしました。');
}
