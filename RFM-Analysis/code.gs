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



function isAdminUser() {
  return true;
}


function getConfig(request) {
  var configParams = request.configParams;
  var spreadsheet;

  var isFirstStep = configParams === undefined;
  var config = cc.getConfig();

  if (isFirstStep) {
    config.setIsSteppedConfig(true);
  }

 // if (isFirstStep) {
    // Step 1: Enter Google Sheets URL
      var sheetUrl = config.newTextInput()
      .setId("sheetUrl")
      .setName("Google Sheets URL")
      .setHelpText("Enter the URL of your Google Sheets spreadsheet")
      .setPlaceholder("https://docs.google.com/spreadsheets/d/your-sheet-id/edit")
      .setIsDynamic(true);
  //}



 if (!isFirstStep && configParams.sheetUrl) {

    // Step 2: Select Sheet Name
    spreadsheet = SpreadsheetApp.openByUrl(configParams.sheetUrl)
    var sheets = spreadsheet.getSheets();
    var sheetNames = sheets.map(function(sheet) {
      return sheet.getName();
    });

    var sheetName = config.newSelectSingle()
      .setId("sheetName")
      .setName("Sheet Name")
      .setHelpText("Choose the sheet that your sales data are stored")
      .addOption(
        config.newOptionBuilder()
        .setLabel("Select a sheet")
        .setValue("")
        )
      .setIsDynamic(true);
    
    sheetNames.forEach(function(name) {
      sheetName.addOption(config.newOptionBuilder().setLabel(name).setValue(name));
    });


    if (!configParams.sheetName)
    config.setIsSteppedConfig(true);

    
  }


  if (!isFirstStep && configParams.sheetName) {
    
    // Step 3: Select Columns for ID, Price, and Date
    var selectedSheet = spreadsheet.getSheetByName(configParams.sheetName);
    var headers = selectedSheet.getRange(1, 1, 1, selectedSheet.getLastColumn()).getValues()[0];

    var idColumn = config.newSelectSingle()
      .setId("idColumn")
      .setName("Customer ID Column")
      .setHelpText("Choose the column that containes unique identifiers for each user; it can be users' email, ID, etc.")
      .addOption(config.newOptionBuilder().setLabel("Select a column").setValue(""));
    
    var priceColumn = config.newSelectSingle()
      .setId("amountColumn")
      .setName("Amount Column")
      .setHelpText("Choose the column that contains the amounts of sales")
      .addOption(config.newOptionBuilder().setLabel("Select a column").setValue(""));
    
    var dateColumn = config.newSelectSingle()
      .setId("dateColumn")
      .setName("Date Column")
      .setHelpText("Choose the column that contains dates of transactions")
      .addOption(config.newOptionBuilder().setLabel("Select a column").setValue(""));

    headers.forEach(function(header, index) {
      idColumn.addOption(config.newOptionBuilder().setLabel(header).setValue(index ));
      priceColumn.addOption(config.newOptionBuilder().setLabel(header).setValue(index));
      dateColumn.addOption(config.newOptionBuilder().setLabel(header).setValue(index));
    });
  }

  return config.build();
}





function getFields(){

  var cc = DataStudioApp.createCommunityConnector();
  var fields = cc.getFields();
  var types = cc.FieldType;
  //var aggregations = cc.AggregationType;

  fields.newDimension()
    .setId('customer')
    .setType(types.TEXT)
    .setName('Customer');


  fields.newDimension()
    .setId('recency')
    .setType(types.NUMBER)
    .setName('Recency');

  fields.newDimension()
    .setId('frequency')
    .setType(types.NUMBER)
    .setName('Frequency');
  
  fields.newDimension()
    .setId('monetary')
    .setType(types.NUMBER)
    .setName('Monetary');

  fields.newDimension()
    .setId('rscore')
    .setType(types.NUMBER)
    .setName('R Score');

  fields.newDimension()
    .setId('fscore')
    .setType(types.NUMBER)
    .setName('F Score');

  fields.newDimension()
    .setId('mscore')
    .setType(types.NUMBER)
    .setName('M Score');

  fields.newDimension()
    .setId('profile')
    .setType(types.TEXT)
    .setName('Profile');


  return fields;


}

function getSchema(request) {

  return { schema: getFields().build() };
}


function generateSummary(request,requestedFields) {



  var configParams = request.configParams;
  //index of each input dimension
  var c = configParams.idColumn;
  var a = configParams.amountColumn;
  var d = configParams.dateColumn ;


  // Get the source sheet (Sheet1) and data range
  var sourceSheet = SpreadsheetApp.openByUrl(configParams.sheetUrl).getSheetByName(configParams.sheetName);
  var sourceRange = sourceSheet.getDataRange();

  var sourceValues = sourceRange.getValues();

  // Create a dictionary to store customer information
  var customerData = {};


  // Iterate through the data in Sheet1
  for (var i = 1; i < sourceValues.length; i++) {
    var customerId = sourceValues[i][c];
    var purchaseDate = new Date(sourceValues[i][d]);
    var purchaseAmount = sourceValues[i][a];

    // Update customer data or create a new entry
    if (customerData[customerId]) {
      // Update Recency (days since the latest purchase)
      var daysSinceLastPurchase = Math.floor((new Date() - purchaseDate) / (1000 * 60 * 60 * 24));
      customerData[customerId].recency = Math.min(daysSinceLastPurchase, customerData[customerId].recency);

      // Update Frequency (number of purchases)
      customerData[customerId].frequency++;

      // Update Monetary (total purchase amount)
      customerData[customerId].monetary += purchaseAmount;
    } else {
      // Create a new entry for the customer
      customerData[customerId] = {
        recency: Math.floor((new Date() - purchaseDate) / (1000 * 60 * 60 * 24)),
        frequency: 1,
        monetary: purchaseAmount
      };
    }
  }

  // Calculate Recency, Frequency, and Monetary scores
  var recencyScores = calculateScores(getValuesArray(customerData, 'recency'),false);
  var frequencyScores = calculateScores(getValuesArray(customerData, 'frequency'),true);
  var monetaryScores = calculateScores(getValuesArray(customerData, 'monetary'),true);

  // Create an array for the data to be written to Sheet2
  //var summaryData = {"values":['uid', 'recency', 'frequency', 'monetary', 'rscore', 'fscore', 'mscore' , 'segment']};
  var summaryData = [];


  // Populate the summary data array
  for (var customerId in customerData) {
    var requestedRow = [];
    var customerInfo = customerData[customerId];
    var rScore = recencyScores[customerInfo.recency];
    var fScore = frequencyScores[customerInfo.frequency];
    var mScore = monetaryScores[customerInfo.monetary];
    var profile = getProfileLabel(rScore, fScore);

    requestedFields.asArray().map(function(requestedField) {
    switch (requestedField.getId()) {

      case 'customer':
        return requestedRow.push(customerId);
      
      case 'recency':
        return requestedRow.push(customerInfo.recency);
      
      case 'frequency':
        return requestedRow.push(customerInfo.frequency);
        
      case 'monetary':
        return requestedRow.push(customerInfo.monetary);
        
      case 'rscore':
        return requestedRow.push(rScore);
        
      case 'fscore':
        return requestedRow.push(fScore);
        
      case 'mscore':
        return requestedRow.push(mScore);
        
      case 'profile':
        return requestedRow.push(profile);

      default:
        return '';    

    }
    });

    summaryData.push({values:requestedRow});
  
  }


  


  return summaryData;

  
  
}

function getValuesArray(data, key) {
  return Object.keys(data).map(function(customerId) {
    return data[customerId][key];
  });
}

function calculateScores(values,mode) {

  if(mode) // true for ascending scoring ( higher amounts equal to higher score) and false for descending scoring ( lesser the value, higher the score)
  {
    var sortedValues = values.slice().sort(function(a, b) {
      return a - b;
    });
  }
  else{
      var sortedValues = values.slice().sort(function(a, b) {
      return b - a;
    });

  }


  var scoreMap = {};
  var scoreIncrement = Math.ceil(sortedValues.length / 5);

  for (var i = 0; i < sortedValues.length; i++) {
    var score = Math.ceil((i + 1) / scoreIncrement);
    scoreMap[sortedValues[i]] = score;
  }

  return scoreMap;
}

function getProfileLabel(rScore, fScore) {
  // Define the labels based on R and F scores
  var labels = {
  1: {
    1: "Hibernating",
    2: "Hibernating",
    3: "At Risk",
    4: "At Risk",
    5: "Can't Lose Them"
  },
  2: {
    1: "Hibernating",
    2: "Hibernating",
    3: "At Risk",
    4: "At Risk",
    5: "Can't Lose Them"
  },
  3: {
    1: "About to Sleep",
    2: "About to Sleep",
    3: "Need Attention",
    4: "Loyal Customers",
    5: "Loyal Customers"
  },
  4: {
    1: "Promising",
    2: "Potential Loyalities",
    3: "Potential Loyalities",
    4: "Loyal Customers",
    5: "Loyal Customers"
  },
  5: {
    1: "New Customers",
    2: "Potential Loyalities",
    3: "Potential Loyalities",
    4: "Champions",
    5: "Champions"
  }
  };


  // Return the label based on R and F scores
  return labels[rScore][fScore] || 'Unknown';
}


function getData(request) {

  var requestedFieldIds = request.fields.map(function (field) {
    return field.name;
  });
  var requestedFields = getFields().forIds(requestedFieldIds);
  
  console.log(requestedFields.build());


  var data = generateSummary(request,requestedFields);

  
  

  var result = {
    schema: requestedFields.build(),
    rows: data
  };

  

  return result;
  
}
