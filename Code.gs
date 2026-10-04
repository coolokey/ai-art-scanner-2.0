/**
 * AI 藝術能量掃描儀 2.0 - 專屬後端 Google Apps Script (安全強化與競賽高可用一體化版本)
 * 
 * 核心職責：
 * 1. 管理密碼保護：僅管理者可檢視與設定 Gemini API Key 及 Google 雲端收件資料夾。
 * 2. 伺服器端 AI 多模態代理 (Backend Vision Proxy)：API 金鑰 100% 保存在 Google 伺服器端，不暴露於瀏覽器。
 * 3. 學生作品評量與防弊 (Zero-shot Verification)：客觀比對畫作與主題，杜絕空白或文不對題盲目給分。
 * 4. 成果作品雲端存檔與總表登記：自動建立主題資料夾、58mm 胸章圖檔存檔、Google 試算表寫入 (含並發鎖定與公式防禦)。
 */

var SCRIPT_PROPS_ = PropertiesService.getScriptProperties();
var DEFAULT_ADMIN_PASSWORD_ = 'admin888';
var DEFAULT_FOLDER_ID_ = '1tutM_vmGgeqPBepWj2goiW1zmOe9keF0';

function doGet(e) {
  var folderId = SCRIPT_PROPS_.getProperty('FOLDER_ID') || DEFAULT_FOLDER_ID_;
  var hasApiKey = !!SCRIPT_PROPS_.getProperty('GEMINI_API_KEY');
  return ContentService.createTextOutput(JSON.stringify({
    status: 'online',
    system: 'AI Art Scanner 2.0 Backend (Production)',
    hasFolder: !!folderId,
    hasApiKey: hasApiKey,
    activeModel: SCRIPT_PROPS_.getProperty('ACTIVE_MODEL') || 'gemini-1.5-flash'
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('未收到有效的請求資料 (Empty Body)');
    }
    var payload = JSON.parse(e.postData.contents);
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
        apiKeyMasked: maskKey_(SCRIPT_PROPS_.getProperty('GEMINI_API_KEY') || ''),
        folderId: SCRIPT_PROPS_.getProperty('FOLDER_ID') || DEFAULT_FOLDER_ID_,
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
      if (payload.activeModel && payload.activeModel.trim()) {
        SCRIPT_PROPS_.setProperty('ACTIVE_MODEL', payload.activeModel.trim());
      }
      return jsonResp_({ success: true, message: '設定已成功儲存於伺服器端！' });
    }

    // 4. 測試 Gemini 連線（自動探索模型）
    if (action === 'testGemini') {
      verifyAdmin_(payload.password);
      var key = payload.apiKey || SCRIPT_PROPS_.getProperty('GEMINI_API_KEY');
      if (!key) throw new Error('尚未設定 Gemini API Key');
      var testResult = testGeminiConnection_(key);
      return jsonResp_(testResult);
    }

    // 5. 學生/評審畫作多模態 AI 評析 (Backend Vision Proxy)
    if (action === 'analyzeArtwork') {
      var result = analyzeArtworkOnBackend_(payload);
      return jsonResp_({ success: true, result: result });
    }

    // 6. 學生作品達標後上傳至 Google 雲端硬碟並登記試算表
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
 * 伺服器端執行嚴格客觀的多模態 AI 藝術評審
 */
function analyzeArtworkOnBackend_(payload) {
  var key = SCRIPT_PROPS_.getProperty('GEMINI_API_KEY');
  var model = SCRIPT_PROPS_.getProperty('ACTIVE_MODEL') || 'gemini-1.5-flash';
  if (!key) {
    throw new Error('伺服器尚未配置 Gemini API Key，請老師由管理設定進行綁定。');
  }

  var rawBase64 = String(payload.imageBase64 || '');
  if (!rawBase64) throw new Error('未提供畫作圖片資料');
  var cleanBase64 = rawBase64.replace(/^data:image\/\w+;base64,/, '');

  var theme = String(payload.theme || '自由創作').trim();
  var focusDesc = String(payload.focusDesc || '畫面主客體構圖與美學表現力').trim();
  var studentNote = String(payload.studentNote || '').trim();
  var sanitizedNote = studentNote ? studentNote.slice(0, 150).replace(/["`]/g, '') : '';
  var noteText = sanitizedNote ? '\n【學生自述作品內容與創作理念（他在畫什麼）】：\n「' + sanitizedNote + '」\n' : '';

  var prompt = '你是一位國際級嚴格且公正的美術教育評審。\n' +
    '請先仔細「檢視並描述」這張圖片中真實出現的內容是什麼（例如：是一個戴帽子的動漫少年？一隻趴著的貓咪？一盤食物？自然風景？還是隨便亂畫的草稿、空白紙或隨手拍照片）。\n\n' +
    '使用者選擇挑戰的領域是：「' + theme + '」。\n' +
    '該領域核心評估規準是：「' + focusDesc + '」。' + noteText + '\n\n' +
    '【最關鍵第一審查原則：文不對題與創作真實性檢驗（防作弊/防盲目給分）】：\n' +
    '- 請先判斷：畫面主體是否真正屬於「' + theme + '」' + (sanitizedNote ? '，且畫面是否呼應學生所自述「' + sanitizedNote + '」的內容與創作意圖？' : '？') + '\n' +
    '- 若畫面內容明顯與「' + theme + '」無關' + (sanitizedNote ? '，或與學生自述之「' + sanitizedNote + '」完全不符' : '') + '（例如：選動漫人物卻上傳了動物/食物/建築/風景，或根本不是繪畫創作而是隨手拍生活物品或空白紙）：\n' +
    '  1. themeScore 請直接給予極低的懲罰分數（10 ~ 30 分）！\n' +
    '  2. feedback 第一句必須直接揭露實情並嚴格指出：「畫面內容為...，與所選主題『' + theme + '』' + (sanitizedNote ? '及自述內容' : '') + '完全文不對題！無法列入評鑑，請重新換題或重畫。」\n' +
    '- 只有當圖片確實屬於「' + theme + '」且具備一定創作意圖時' + (sanitizedNote ? '（並在畫面上能看到學生努力描摹其自述之構想）' : '') + '，themeScore 才能正常在 65 ~ 95 分之間評估。\n\n' +
    '【各指標嚴格評分標準（0~100 分）】：\n' +
    '1. themeScore (35%): 主題契合度（是否符合所選領域之核心精神' + (sanitizedNote ? '，是否真實展現自述構想' : '') + '）\n' +
    '2. compScore (20%): 構圖重心與結構（主體是否居中或符合三分法則？圓形胸章範圍內主體比例是否得當？是否太小或出框？）\n' +
    '3. colorScore (15%): 色彩冷暖與豐富度（用色是否具有氛圍？色調是否單調混濁？）\n' +
    '4. lightScore (15%): 明暗立體感（是否有陰影、受光面、反光立體感？）\n' +
    '5. detailScore (15%): 筆觸細節與線條質感（邊緣線條是否俐落？細節描摹是否用心？）\n\n' +
    '請嚴格回傳純 JSON 格式（絕對不要包含 ```json 標記或任何額外說明）：\n' +
    '{\n' +
    '  "imageDescription": "畫面客觀描述(30字內)",\n' +
    '  "themeScore": 85,\n' +
    '  "compScore": 88,\n' +
    '  "colorScore": 82,\n' +
    '  "lightScore": 80,\n' +
    '  "detailScore": 84,\n' +
    '  "title": "具風格特色之專屬稱號(8字內)",\n' +
    '  "feedback": "教練深度講評(包含畫面客觀優缺點，60字內)",\n' +
    '  "advice": "次世代修煉建議(具體修改技巧，45字內)",\n' +
    '  "focusX": 0.5,\n' +
    '  "focusY": 0.45,\n' +
    '  "palette": ["#173e35", "#24654d", "#e4edb7", "#d97706", "#ffffff"]\n' +
    '}';

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + key;
  var requestPayload = {
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        { inlineData: { mimeType: 'image/png', data: cleanBase64 } }
      ]
    }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json'
    }
  };

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(requestPayload),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    throw new Error('AI 視覺分析伺服器回應異常 (HTTP ' + response.getResponseCode() + ')：' + response.getContentText().slice(0, 100));
  }

  var resJson = JSON.parse(response.getContentText());
  var rawText = resJson.candidates && resJson.candidates[0] && resJson.candidates[0].content && resJson.candidates[0].content.parts[0].text;
  if (!rawText) throw new Error('AI 未能回傳有效評量文字');

  var clean = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  var parsed = JSON.parse(clean);

  parsed.totalScore = Math.round(
    parsed.themeScore * 0.35 +
    parsed.compScore * 0.20 +
    parsed.colorScore * 0.15 +
    parsed.lightScore * 0.15 +
    parsed.detailScore * 0.15
  );
  return parsed;
}

/**
 * 將胸章作品存入 Google Drive 並登記試算表
 */
function saveArtworkToDrive_(data) {
  var lock = LockService.getScriptLock();
  try {
    // 最多等待 20 秒取得排程鎖定，徹底杜絕高併發重複建立資料夾與試算表
    lock.waitLock(20000);

    var folderId = (data.folderId && data.folderId.trim()) || SCRIPT_PROPS_.getProperty('FOLDER_ID') || DEFAULT_FOLDER_ID_;
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
    var rawBase64 = data.imageBase64.replace(/^data:image\/\w+;base64,/, '');

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
    
    var blob = Utilities.newBlob(decodedBytes, 'image/png', fileName);
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
