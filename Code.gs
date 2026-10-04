/**
 * AI 藝術能量掃描儀 2.0 - 專屬後端 Google Apps Script
 * 
 * 核心職責：
 * 1. 管理密碼保護：僅管理者可檢視與設定 Gemini API Key 及 Google 雲端收件資料夾。
 * 2. 成果作品雲端存檔：學生作品評分達標 (85+) 後，自動將胸章圖檔存入專屬 Google Drive 資料夾。
 * 3. 自動化成果試算表：即時將學生資料、分數、稱號、評語及檔案連結記錄於 Google Sheet。
 * 
 * 注意：本專案為全新獨立後端，請建立全新 Google Apps Script 專案部署，勿覆蓋舊有系統。
 */

var SCRIPT_PROPS_ = PropertiesService.getScriptProperties();
var DEFAULT_ADMIN_PASSWORD_ = 'admin888';

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'online',
    system: 'AI Art Scanner 2.0 Backend',
    hasFolder: !!SCRIPT_PROPS_.getProperty('FOLDER_ID'),
    hasApiKey: !!SCRIPT_PROPS_.getProperty('GEMINI_API_KEY')
  })).setMimeType(ContentService.MimeType.JSON);
}

function legacyPost_(e) {
  try {
    var payload = JSON.parse(e.postData.contents || '{}');
    var action = payload.action;

    // 1. 管理密碼驗證
    if (action === 'verifyAdmin') {
      var ok = checkAdminPassword_(payload.password);
      return jsonResp_({ success: ok, message: ok ? '驗證成功' : '密碼錯誤' });
    }

    // 2. 讀取管理設定（需密碼）
    if (action === 'getSettings') {
      verifyAdmin_(payload.password);
      return jsonResp_({
        success: true,
        hasApiKey: !!SCRIPT_PROPS_.getProperty('GEMINI_API_KEY'),
        folderId: SCRIPT_PROPS_.getProperty('FOLDER_ID') || '',
        activeModel: SCRIPT_PROPS_.getProperty('ACTIVE_MODEL') || 'gemini-1.5-flash'
      });
    }

    // 3. 儲存管理設定（需密碼）
    if (action === 'saveSettings') {
      verifyAdmin_(payload.password);
      if (payload.apiKey && payload.apiKey.trim()) {
        SCRIPT_PROPS_.setProperty('GEMINI_API_KEY', payload.apiKey.trim());
      }
      if (payload.folderId !== undefined) {
        SCRIPT_PROPS_.setProperty('FOLDER_ID', payload.folderId.trim());
      }
      if (payload.newPassword && payload.newPassword.trim()) {
        SCRIPT_PROPS_.setProperty('ADMIN_PASSWORD', payload.newPassword.trim());
      }
      if (payload.activeModel) {
        SCRIPT_PROPS_.setProperty('ACTIVE_MODEL', payload.activeModel.trim());
      }
      return jsonResp_({ success: true, message: '設定已成功儲存！' });
    }

    // 4. 測試 Gemini 連線（自動探索模型）
    if (action === 'testGemini') {
      verifyAdmin_(payload.password);
      var key = SCRIPT_PROPS_.getProperty('GEMINI_API_KEY');
      if (!key) throw new Error('尚未設定 Gemini API Key');
      var testResult = testGeminiConnection_(key);
      return jsonResp_(testResult);
    }

    // 5. 學生作品達標後上傳至 Google 雲端硬碟
    if (action === 'uploadArtwork') {
      var uploadResult = saveArtworkToDrive_(payload);
      return jsonResp_({ success: true, data: uploadResult });
    }

    throw new Error('未知的操作指令：' + action);

  } catch (err) {
    return jsonResp_({ success: false, error: err.message });
  }
}

function jsonResp_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function checkAdminPassword_(pwd) {
  var stored = SCRIPT_PROPS_.getProperty('ADMIN_PASSWORD') || DEFAULT_ADMIN_PASSWORD_;
  return String(pwd || '').trim() === stored;
}

function verifyAdmin_(pwd) {
  if (!checkAdminPassword_(pwd)) {
    throw new Error('管理密碼錯誤，拒絕存取！');
  }
}

function maskKey_(k) {
  if (!k || k.length < 8) return '';
  return k.slice(0, 6) + '...' + k.slice(-4);
}

/**
 * 測試並自動反查 Gemini 模型
 */
function testGeminiConnection_(key) {
  var listUrl = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + key;
  var listResp = UrlFetchApp.fetch(listUrl, { muteHttpExceptions: true });
  if (listResp.getResponseCode() !== 200) {
    throw new Error('無法存取 Google AI 伺服器 (HTTP ' + listResp.getResponseCode() + ')：' + listResp.getContentText().slice(0, 120));
  }
  var data = JSON.parse(listResp.getContentText());
  var models = data.models || [];
  var valid = models.filter(function(m) {
    return m.supportedGenerationMethods && m.supportedGenerationMethods.indexOf('generateContent') >= 0;
  });
  if (valid.length === 0) throw new Error('您的 API Key 尚未開通支援 generateContent 的模型。');

  // 優先匹配 flash
  var chosen = valid.find(function(m) { return m.name.indexOf('2.0-flash') >= 0; }) ||
               valid.find(function(m) { return m.name.indexOf('1.5-flash') >= 0; }) ||
               valid[0];
  var modelName = chosen.name.replace(/^models\//, '');

  // 進行 Ping
  var pingUrl = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelName + ':generateContent?key=' + key;
  var pingResp = UrlFetchApp.fetch(pingUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] }),
    muteHttpExceptions: true
  });

  if (pingResp.getResponseCode() === 200) {
    SCRIPT_PROPS_.setProperty('ACTIVE_MODEL', modelName);
    return { success: true, model: modelName, message: '成功連線至 ' + modelName + '！' };
  } else {
    throw new Error('模型 ' + modelName + ' 測試回應 HTTP ' + pingResp.getResponseCode());
  }
}

/**
 * 將通過 85 分的胸章作品存入 Google Drive 並登記試算表
 */
function saveArtworkToDrive_(data) {
  var lock = LockService.getScriptLock();
  try {
    // 最多等待 20 秒取得排程鎖定，徹底杜絕高併發重複建立資料夾與試算表
    lock.waitLock(20000);

    var folderId = SCRIPT_PROPS_.getProperty('FOLDER_ID');
    if (!folderId) {
      throw new Error('伺服器端尚未設定 Google 雲端收件資料夾 ID (FOLDER_ID)！請聯絡老師。');
    }

    var rootFolder = DriveApp.getFolderById(folderId);
    var studentId = String(data.studentId || '無座號').trim();
    var studentName = String(data.studentName || '匿名').trim();
    var theme = String(data.theme || '未分類').trim();
    var title = String(data.title || '特級繪師').trim();
    var score = Number(data.totalScore || 0);

    // 依「主題」自動建立子分類資料夾
    var themeFolder = getOrCreateFolder_(rootFolder, theme);

    // 處理 Base64 圖片轉成二進位 Blob (防呆與容錯)
    if (!data.imageBase64 || typeof data.imageBase64 !== 'string') {
      throw new Error('未收到有效的圖片編碼資料 (Base64 Missing)');
    }
    var parts = data.imageBase64.match(/^data:(image\/[a-zA-Z0-9\+\-]+);base64,(.+)$/);
    var mimeType = parts ? parts[1] : 'image/png';
    var rawBase64 = parts ? parts[2] : data.imageBase64.replace(/^data:image\/\w+;base64,/, '');

    var decodedBytes;
    try {
      decodedBytes = Utilities.base64Decode(rawBase64);
    } catch (e) {
      throw new Error('Base64 圖片解碼失敗，資料可能已損毀');
    }

    var timeStr = Utilities.formatDate(new Date(), 'GMT+8', 'yyyyMMdd_HHmmss');
    // 清理 Windows 系統禁用檔名字元
    var cleanId = studentId.replace(/[\\/:*?"<>|\r\n]/g, '_');
    var cleanName = studentName.replace(/[\\/:*?"<>|\r\n]/g, '_');
    var fileName = cleanId + '_' + cleanName + '_' + score + '分_' + timeStr + '.png';
    
    var blob = Utilities.newBlob(decodedBytes, mimeType, fileName);
    var savedFile = themeFolder.createFile(blob);
    savedFile.setDescription('AI 藝術能量掃描儀成果作品 - ' + studentName + ' (' + studentId + ') ｜ 稱號：' + title + ' ｜ 總分：' + score);

    // 登記至 Google 試算表 (含公式注入防禦)
    var sheet = getOrCreateArtSheet_(rootFolder);
    var fileUrl = savedFile.getUrl();
    sheet.appendRow([
      new Date(),
      sanitizeCell_(studentId),
      sanitizeCell_(studentName),
      sanitizeCell_(theme),
      sanitizeCell_(data.studentNote || ''),
      score,
      sanitizeCell_(title),
      Number(data.themeScore || 0),
      Number(data.compScore || 0),
      Number(data.colorScore || 0),
      Number(data.lightScore || 0),
      Number(data.detailScore || 0),
      sanitizeCell_(data.feedback || ''),
      sanitizeCell_(data.advice || ''),
      fileUrl
    ]);

    return {
      fileId: savedFile.getId(),
      fileName: fileName,
      fileUrl: fileUrl,
      timestamp: new Date().toISOString()
    };
  } finally {
    lock.releaseLock();
  }
}

function sanitizeCell_(val) {
  var str = String(val == null ? '' : val);
  // 若開頭為試算表公式特殊符號，強制前綴單引號防止 Formula Injection
  if (/^[\=\+\-\@\t\r]/.test(str)) {
    return "'" + str;
  }
  return str;
}

function getOrCreateFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function getOrCreateArtSheet_(rootFolder) {
  var sheetName = 'AI藝術能量成果彙整總表';
  var it = rootFolder.getFilesByName(sheetName);
  var ss;
  if (it.hasNext()) {
    ss = SpreadsheetApp.openById(it.next().getId());
  } else {
    ss = SpreadsheetApp.create(sheetName);
    var file = DriveApp.getFileById(ss.getId());
    rootFolder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
    var s = ss.getActiveSheet();
    s.setName('獲獎作品總覽');
    s.appendRow([
      '評鑑時間', '班級座號', '創作者姓名', '挑戰主題', '學生創作理念(我在畫什麼)', '綜合總分', '認證稱號',
      '主題契合(35%)', '構圖重心(20%)', '色彩豐富(15%)', '明暗立體(15%)', '筆觸線條(15%)',
      '教練深度講評', '修煉建議', '胸章圖片雲端連結'
    ]);
    s.setFrozenRows(1);
    s.getRange('1:1').setBackground('#0f172a').setFontColor('#38bdf8').setFontWeight('bold');
  }
  return ss.getActiveSheet();
}

