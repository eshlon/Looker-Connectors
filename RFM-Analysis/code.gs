var cc = DataStudioApp.createCommunityConnector();


function sendUserError(message) {
  cc.newUserError()
    .setText(message)
    .throwException();
}

function getAuthType() {
  var AuthTypes = cc.AuthType;
  return cc
    .newAuthTypeResponse()
    .setAuthType(AuthTypes.NONE)
    .build();
}


function isAdminUser(){
  return true;
}


function getConfig(request) {
  var config = cc.getConfig();
  
  config.setDateRangeRequired(false);

  config
    .newTextInput()
    .setId('url')
    .setName('Enter the URL of your CSV');

  config
    .newSelectSingle()
    .setId('delimiter')
    .setName('Select the delimiter between each value')
    .setAllowOverride(false)
    .addOption(
      config
        .newOptionBuilder()
        .setLabel('Comma')
        .setValue(',')
    )
    .addOption(
      config
        .newOptionBuilder()
        .setLabel('Semicolon')
        .setValue(';')
    )
    .addOption(
      config
        .newOptionBuilder()
        .setLabel('Tabulation')
        .setValue('\t')
    );

  config
    .newSelectSingle()
    .setId('textQualifier')
    .setName('Are the values surrounded by single or double quotes?')
    .setAllowOverride(false)
    .addOption(
      config
        .newOptionBuilder()
        .setLabel('No Quotes')
        .setValue('undefined')
    )
    .addOption(
      config
        .newOptionBuilder()
        .setLabel('Single Quotes')
        .setValue("'")
    )
    .addOption(
      config
        .newOptionBuilder()
        .setLabel('Double Quotes')
        .setValue('"')
    );



  //config.setDateRangeRequired(true); no need to add date in transfers currnetly
  
  return config.build();
}



function findLineSeparator(content) {
  if (!content) {
    return undefined;
  }
  if (content.indexOf('\r\n') >= 0) {
    // Windows
    return '\r\n';
  } else if (content.indexOf('\r') >= 0) {
    // MacOS
    return '\r';
  } else if (content.indexOf('\n') >= 0) {
    // Linux / OSX
    return '\n';
  } else {
    return undefined;
  }
}



function fetchData(url) {
  if (!url || !url.match(/^https?:\/\/.+$/g)) {
    sendUserError('"' + url + '" is not a valid url.');
  }
  var response = UrlFetchApp.fetch(url);
  var content = response.getContentText();
  if (!content) {
    sendUserError('"' + url + '" returned no content.');
  }
  return content;
}

function getFields(request) {
  var cc = DataStudioApp.createCommunityConnector();
  var fields = cc.getFields();
  var types = cc.FieldType;

  fields.newDimension()
  .setId('uid')
  .setType(types.TEXT)
  .setName('User Identifier');

  fields.newDimension()
  .setId('rscore')
  .setType(types.NUMBER)
  .setName('Recency Score');

  fields.newDimension()
  .setId('recency')
  .setType(types.NUMBER)
  .setName('Recency');

  fields.newDimension()
  .setId('frequency')
  .setType(types.NUMBER)
  .setName('Frequency');

  fields.newDimension()
  .setId('fscore')
  .setType(types.NUMBER)
  .setName('Frequency Score');

  fields.newDimension()
  .setId('monetary')
  .setType(types.NUMBER)
  .setName('Monetary');

  fields.newDimension()
  .setId('labels')
  .setType(types.TEXT)
  .setName('Labels');


  return fields;
}


function getSchema(request) {
  
  var fields = getFields(request).build();
  return {schema: fields};
}


function setLabels(r_score,f_score)
{
  if (r_score<=2 && f_score <=2){
    return "Hibernating";
  }
  else if (r_score <= 2 && (f_score == 3 || f_score == 4)){
    return "At Risk";
  }
  else if (r_score <= 2 && f_score == 5){
    return "Can't Lose Them";
  }
  else if (r_score == 3 && f_score <= 2){
    return "About to Sleep";
  }
  else if (r_score == 3 && f_score == 3){
    return "Need Attention";
  }
  else if ((r_score == 3 || r_score == 4) && (f_score == 4 || f_score == 5)){
    return "Loyal Customers";
  }
  else if (r_score == 4 && f_score == 1){
    return "Promissing";
  }
  else if (r_score == 5 && f_score == 1){
    return "New Customers";
  }
  else if (r_score >= 4 && (f_score == 2 || f_score == 3)){
    return "Potential Loyalities";
  }
  else if (r_score == 5 &&  (f_score == 4 || f_score == 5)){
    return "Champions";
  }
  else{
    sendUserError('Scores are not correct. R-Score: '+r_score+' F-Score: '+f_score);
  }
    

}


function rfmCalculate(userID,tdate,tfee,requestedFields)
{
  var now = new Date();


  // unique IDs from transactions
  var uniqueIds = userID.filter(function(value,index,array){
    return array.indexOf(value) === index;
  });


  var monetary = []; // Monetary Field

  // finding the latest date of every user's transaction + Summation of Monetary field. problem: N^2
  var filteredDates = uniqueIds.map(function(value,index,array){
    var allDates=[];
    var allFees = 0;

    for(let i=0; i<userID.length;i++)
    {
      if(userID[i] == value)
      {
        allDates.push(new Date(tdate[i]));
        allFees += parseInt(tfee[i]);
      }
    }

    monetary.push(allFees);
    var maxDate = Math.max.apply(null,allDates);
    return maxDate;

  });


  var reccency = filteredDates.map(x => Math.round((now.getTime()- new Date(x).getTime())/(1000*3600*24)));
  
  // counting each unique ID in transactions
  var frequency = uniqueIds.map(function(value,index,array){

    return userID.filter(function(v){
      return v == value;
    }).length ;

  });


  // f-score formula to map frequenct to 1-5 scale
  var freqMin = Math.min.apply(null,frequency);
  var freqMax = Math.max.apply(null,frequency);
  var freqRange = freqMax - freqMin;
  var f_score = frequency.map(function(value){
    var score;
    if (value !== freqMin){
      score = Math.ceil((value-freqMin)/freqRange*5); // new scale of 1-5
    }else
    {
      score = 1; // 1 for the min value, avoiding formula to generate 0
    }
    return score; 
  })

  // r-score formula to map frequenct to 1-5 scale
  var recMin = Math.min.apply(null,reccency);
  var recMax = Math.max.apply(null,reccency);
  var recRange = recMax - recMin;
  var r_score = reccency.map(function(value){
    var score;
    if (value !== recMax){
      score = Math.ceil((recMax - value)/recRange*5); // new scale of 1-5
    }
    else{
      score = 1; // 1 for the min value, avoiding formula to generate 0
    }
    return score; 
  })


  
  var rows = uniqueIds.map(function(value,index){

    var currentRow = [];
    requestedFields.asArray().forEach(function(field){

      switch (field.getId()) {
        case 'uid':
          return currentRow.push(value);;
        case 'rscore':
          return currentRow.push(r_score[index]);
        case 'fscore':
          return currentRow.push(f_score[index]);
        case 'monetary':
          return currentRow.push(monetary[index]);
        case 'recency':
          return currentRow.push(reccency[index]);
        case 'frequency':
          return currentRow.push(frequency[index]);
        case 'labels':
          return currentRow.push(setLabels(r_score[index],f_score[index]));
        default:
          return currentRow.push('');
      }
     });

     return {values: currentRow};
  });
  
  return rows;  

}


function getData(request) {

  var content = fetchData(request.configParams.url);
  var requestedFieldIds = request.fields.map(function(field) {
    return field.name;
  });
  var requestedFields = getFields().forIds(requestedFieldIds);



  var textQualifier = request.configParams.textQualifier;//'undefined'
  var delimiter = request.configParams.delimiter;//','

  var lineSeparator = findLineSeparator(content);
  var contentRows;
  if (lineSeparator) {
    contentRows = content.split(lineSeparator);
  } else {
    contentRows = [content];
  }

  var valueSeparator = delimiter;
  if (textQualifier !== 'undefined') {
    valueSeparator = textQualifier + valueSeparator + textQualifier;
  }

  var userID = [];
  var tdate = [];
  var tfee = [];

  var userIDIndex = 0;
  var tdateIndex = 0;
  var tfeeIndex = 0;

  

  contentRows
    .filter(function(contentRow) {
      // Remove rows that are empty.
      return contentRow.trim() !== '';
    })
    .map(function(contentRow, idx) {
      if (textQualifier !== 'undefined') {
        contentRow = contentRow.substring(1, contentRow.length - 1);
      }
      var allValues = contentRow.split(valueSeparator);

      if(idx !=0) // for the Header row, search and set the index of required fields; for other rows, add each value to relevent array
      {
        userID.push(allValues[userIDIndex]);
        tdate.push(allValues[tdateIndex]);
        tfee.push(allValues[tfeeIndex]);
      }
      else
      {
        for ( var i = 0 ; i < 3 ; i++)
        {
          if(allValues[i] == 'ID')userIDIndex = i;
          if(allValues[i] == 'date')tdateIndex = i;
          if(allValues[i] == 'fee')tfeeIndex = i;

        }
      }
      return ;
     
    });

  var rows = rfmCalculate(userID,tdate,tfee,requestedFields);


  var result = {
    schema: requestedFields.build(),
    rows: rows
  };

  return result;
}



