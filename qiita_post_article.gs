function doPost(e) {
  var verificationToken = e.parameter.token;
  if (verificationToken != PropertiesService.getScriptProperties().getProperty('SLACK_VERIFICATION_TOKEN')) {
    throw new Error('Invalid token');
  }
  
  var [command, id] = e.parameter.text.split(' ');
  switch(command) {
    case 'template':
      addJobQueue(command, id, e.parameter.channel_id);
      var response = { text: 'テンプレートから記事を作成します:cattyping:' };
      break;
    case 'template_list':
      result_message = templateList();
      var response = { text: result_message };
      break;
    default:
      var response = { text: 'なぞのコマンド:catsurprise:' };
      break;
  }

  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}

function templateList() {
  var url = getQiitaUrl() + "/api/v2/templates?page=1&per_page=100";
  var options = {
     "method" : "get",
     "headers" : headers(),
     "muteHttpExceptions": true
  };
  var response = UrlFetchApp.fetch(url, options);
  
  var result = '';
  var json = JSON.parse(response.getContentText());
  json.forEach(function(item, i){
    result += "ID:" + item["id"] + " " + item["title"] + "\n";
  });
  
  return result;
}

function template(template_id) {
  var url = getQiitaUrl() + "/api/v2/templates/:template_id".replace(':template_id', template_id);
  var options = {
     "method" : "get",
     "headers" : headers(),
     "muteHttpExceptions": true
  };
  var response = UrlFetchApp.fetch(url, options);
  var text = response.getContentText();
  
  return replaceDate(text);
}

function replaceDate(text) {
  var now   = new Date();       
  var year  = now.getFullYear();
  var month = now.getMonth() + 1;
  var day   = now.getDate();
  return text.replace('%{Year}', year).replace('%{month}', month).replace('%{day}', day);
}

function createArticle(template_json) {
  var obj = JSON.parse(template_json);
  var article = {
    "body" : obj.body,
    "coediting" : true,
    "group_url_name" : null,
    "private": false,
    "tags": obj.expanded_tags,
    "title": obj.title,
    "tweet": false
  };
  return article;
}

function post(article_json) {
  var url = getQiitaUrl() + "/api/v2/items";

  var options = {
    "method" : "post",
    "contentType" : "application/json",
    "payload" : JSON.stringify(article_json),
    "headers" : headers(),
    "muteHttpExceptions" : false
  };

  var response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() >= 300) {
    return "記事の作成に失敗したよ:man-gesturing-no:\n" + response.getContentText();
  }
  var obj = JSON.parse(response.getContentText());
  return "記事を作成したよ:man-raising-hand:\n" + obj.title + "\n" + obj.url + "";
}

function headers() {
  var token = PropertiesService.getScriptProperties().getProperty('SLACK_AUTH_TOKEN');
  return {
    "Authorization": "Bearer " + token
  };
}

function queueKey() {
  return 'command_queueKey';
}

function createArticleFromTemplate(template_id) {
  var template_json = template(template_id);
  var article_json = createArticle(template_json);
  return post(article_json);
}

function addJobQueue(command, id, channel_id){
  //引数をオブジェクトとしてまとめる
  var newQue = {
    "command": command,
    "id": id,
    "channel_id": channel_id
  }

  cache = CacheService.getScriptCache();
  var data = cache.get(queueKey());

  //cacheの中身がnullならば空配列に，nullでないならstrを配列に変換する.
  if (data == null) {
    data = [];
  } else {
    data = data.split(';');
  }

  //オブジェクトであるnewDataをstrに変換して配列に追加.
  data.push(JSON.stringify(newQue));

  //配列を;で分割するstrに変換.
  cache.put(queueKey(), data.join(';'), 60*2); 

  return;
}

function timeDrivenFunction(){
  // cacheを取得
  cache = CacheService.getScriptCache();
  var data = cache.get(queueKey());
  console.log('===cache data===');
  console.log(data);
  if (data == null) {
    return;
  }

  // cacheの読み書きの競合が怖いのでなるべく早く消しておく
  cache.remove(queueKey());

  data = data.split(';');

  // 配列の中身をstrからJSON(object)に戻し，処理を実行する
  console.log('data length' + data.length);
  for(var i=0; i<data.length; i++){
    data[i] = JSON.parse(data[i]);
    switch(data[i].command) {
      case 'template':
        result_message = createArticleFromTemplate(data[i].id);
        break;
      default:
        result_message = '知らないコマンド';
        break;
    }
    postSlackMessage(result_message, data[i].channel_id);
  }
  return;
}

function postSlackMessage(message, channelId) {
  var token = PropertiesService.getScriptProperties().getProperty('SLACK_LEGACY_TOKEN');
 
  var slackApp = SlackApp.create(token);
  var options = {
    username: "Qiita Post Article"
  }
  
  slackApp.postMessage(channelId, message, options);
  console.log('===finish!===');
}

function getQiitaUrl() {
  PropertiesService.getScriptProperties().getProperty('QIITA_URL')  
}
