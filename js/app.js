var jukelyCity = "new-york";

function jukelyLogin(callback, errorCallback) {
  var http = new XMLHttpRequest();
  var url = "https://api.jukely.com/oauth/token";
  var params = EncodeQueryData({ 
    'facebook[user_id]': fbUid,
    'facebook[access_token]': fbAccessToken,
    'grant_type': 'password'
  });
  http.open("POST", url, true);

  http.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
  http.responseType = 'json';

  http.onreadystatechange = function() {
    if (http.readyState == 4 && http.status == 200) {
      $('#jukely-login-token').text(http.response.access_token);
      callback();
    }
  }
  http.onerror = function() {
    errorCallback("Couldn't login");
  };

  http.send(params);
}

function getEvents(callback, errorCallback) {
  var jukelyAccessToken = $('#jukely-login-token').text();
  var http = new XMLHttpRequest();
  var url = "https://api.jukely.com/v5/metros/" + jukelyCity + "/events?tier=unlimited";

  http.open("GET", url, true);

  http.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
  http.setRequestHeader("Authorization", "Bearer " + jukelyAccessToken);
  http.responseType = 'json';

  http.onreadystatechange = function() {
    if (http.readyState == 4 && http.status == 200) {
      var events = http.response.events;
      var eventObj;
      var trHTML = '';
      var eventStatus;
      var date;

      for (var i=0; i<events.length; i++) {
        eventObj = events[i];
        eventStatus = eventObj.status === 1 ? "Open" : "Closed";
        date = moment(eventObj.available_at);
        trHTML += '<tr id="' + eventObj.parse_id + '"><td>' + 
          '<button type="button" class="addSelection btn btn-info" name="selection">Add</button>' + '</td><td class="numOfSpots">' + 
          '<input name="numOfSpots" id="input-' + eventObj.parse_id + '" style="width:20px;"/>' + '</td>' + 
          '<td><span name="status">' + eventStatus + '</span></td>' + 
          '<td><span name="availableAt">' + date.format('MMMM Do, h:mm:ss a') + '</span></td>' + 
          '<td><span name="headlinerName">' + eventObj.headliner.name + '</span></td>' + 
          '<td><span name="venueName">' + eventObj.venue.name + '</span></td></tr>';
      }

      $('#jukely-events-table tr:last').after(trHTML);
      $(".addSelection").click(addInterestedEventHandler);
      $("#availableSelectText").hide();

      callback();
    }
  }
  http.onerror = function() {
    errorCallback("Couldn't get events");
  };

  http.send(null);
}

var event = new Event('pageSourceGrabbed');
document.addEventListener('pageSourceGrabbed', function (e) { 
  console.log(fbAccessToken);
  console.log(fbUid);

  jukelyLogin(function() {
    chrome.runtime.sendMessage({
      jukelyCheckerAction: "setAccessToken",
      jukelyAccessToken: $('#jukely-login-token').text()
    }, function(response) {
      console.log(response.message);
    });

    getEvents(function() {
      //debugger;
    }, function() {
      //Getting events error
    });
  }, function(errorMessage) {
    //Login error
  });
}, false);

chrome.runtime.onMessage.addListener(function(request, sender) {
  if (request.action == "getSource") {
    message.innerText = request.source;
    fbUid = request.source.match(/_fb_uid = '(.*?)'/)[1];
    fbAccessToken = request.source.match(/_fb_access_token = '(.*?)'/)[1];
    document.dispatchEvent(event);
  }
});

function onWindowLoad() {
  chrome.runtime.sendMessage({
    jukelyCheckerAction: "checkForInterestedEvents"
  }, function(response) {
    if (response.previousEvents) {
      $("#previousSelectedText").show();
    }
    if (response.previousBooked) {
      $("#previousBookedText").show();
    }
  });

  $("#availableSelectText").show();

  $('[data-toggle="tooltip"]').tooltip();

  chrome.tabs.executeScript(null, {
    file: "js/getPagesSource.js"
  }, function() {
    // If you try and inject into an extensions page or the webstore/NTP you'll get an error
    if (chrome.runtime.lastError) {
      $("#message").text('There was an error injecting script : \n' + chrome.runtime.lastError.message);
    }
  });
}

function addInterestedEventHandler(e){
  console.log("Add interested event");
  var row = e.currentTarget.closest("tr");
  var rowId = row.getAttribute("id");
  var numOfSpots = row.children[1].children[0].value;

  if (numOfSpots < 3 && numOfSpots > 0 && $("#jukely-currently-booking-table").find("#" + rowId + "").length < 1) {
    var eventObj = {};
    for (var j = 1, col; col = row.cells[j]; j++) {
      //Only need the headliner name and venue name
      var cell = col.children[0];
      eventObj[cell.getAttribute("name")] = cell.textContent ? cell.textContent : cell.value;
    }
    eventObj.numOfTimesChecked = 0;
    eventObj.bookingStatus = "Checking...";

    trHTML = '<tr id="' + rowId + '">' + 
      '<td><button type="button" class="btn btn-warning removeSelection" data-id="' + rowId + '">Remove</button>' + '</td>' + 
      '<td><span name="bookingStatus" class="bookingStatus">Checking...</span></td>' + 
      '<td><span name="numOfTimesChecked" class="numOfTimesChecked">0</span></td>' + 
      '<td><span name="spots">' + numOfSpots + '</span></td>' + 
      '<td><span name="headlinerName">' + eventObj.headlinerName + '</span></td>' + 
      '<td><span name="venueName">' + eventObj.venueName + '</span></td></tr>';

    $('#jukely-currently-booking-table tr:last').after(trHTML);
    $(".removeSelection").unbind();
    $(".removeSelection").click(removeInterestedEventHandler);

    chrome.runtime.sendMessage({
      jukelyCheckerAction: "addInterestedEvent",
      interestedEvent: eventObj
    }, function(response) {
      console.log(response.message);
    }); 
  } else {
    alert("Number of spots must be 1 or 2 and you cannot have multiple same interested events!");
  }
};

function removeInterestedEventHandler(e) {
  console.log("Remove interested event");
  var row = e.currentTarget.closest("tr");
  var eventObj = {};
  for (var j = 3, col; col = row.cells[j]; j++) {
    //Only need the headliner name and venue name
    var cell = col.children[0];
    eventObj[cell.getAttribute("name")] = cell.textContent;
  }
  row.remove();

  chrome.runtime.sendMessage({
    jukelyCheckerAction: "removeInterestedEvent",
    interestedEvent: eventObj
  }, function(response) {
    console.log(response.message);
  }); 
}

chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    //Get events but found none to be open
    if (request.jukelyCheckerAction === "eventsChecked") {
      //Case where user closed the popup and needs to reload all interested events
      if ($('#jukely-currently-booking-table tr[id]').length < 1) {
        reloadInterestedEventsTable(request.interestedEvents);
      }

      if (request.bookedEvents.length > 0 && $('#jukely-booked-table tr[id]').length < 1) {
        reloadBookedEventsTable(request.bookedEvents);
      }

      for (var i = 0; i < request.interestedEvents.length; i++) {
        var checkedEvent = request.interestedEvents[i];
        var row = $('#jukely-currently-booking-table tr[id="' + checkedEvent.parse_id + '"]');
        var count = parseInt(row.find(".numOfTimesChecked").text());
        
        count++;
        row.find(".numOfTimesChecked").text(count);
      }
      sendResponse({ message: "events checking count updated ok" });
    }

    //Event booking successful
    if (request.jukelyCheckerAction === "eventBooked") {
      var row = $('#jukely-currently-booking-table tr[id="' + request.interestedEvent.parse_id + '"]');

      if (row.length) {
        $('#jukely-currently-booking-table tr[id="' + request.interestedEvent.parse_id + '"]').find(".bookingStatus").text("Booked");;
      }

      sendResponse({ message: "event booking updated ok" });
    }
  });

function reloadInterestedEventsTable(events) {
  var trHTML = "";
  for (var i=0; i<events.length; i++) {
    var event = events[i];

    trHTML += '<tr id="' + event.parse_id + '">' + 
      '<td><button type="button" class="btn btn-warning removeSelection" data-id="' + event.parse_id + '">Remove</button>' + '</td>' + 
      '<td><span name="bookingStatus" class="bookingStatus">Checking...</span></td>' + 
      '<td><span name="numOfTimesChecked" class="numOfTimesChecked">' + event.numOfTimesChecked + '</span></td>' + 
      '<td><span name="spots">' + event.numOfSpots + '</span></td>' + 
      '<td><span name="headlinerName">' + event.headliner.name + '</span></td>' + 
      '<td><span name="venueName">' + event.venue.name + '</span></td></tr>';
  }

  $('#jukely-currently-booking-table tr:last').after(trHTML);
  $(".removeSelection").unbind();
  $(".removeSelection").click(removeInterestedEventHandler);
  $("#previousSelectedText").hide();
}

function reloadBookedEventsTable(events) {
  var trHTML = "";
  for (var i=0; i<events.length; i++) {
    var event = events[i];

    trHTML += '<tr id="' + event.parse_id + '">' + 
      '<td><span name="bookingStatus" class="bookingStatus">Booked</span></td>' + 
      '<td><span name="numOfTimesChecked" class="numOfTimesChecked">' + event.numOfTimesChecked + '</span></td>' + 
      '<td><span name="spots">' + event.numOfSpots + '</span></td>' + 
      '<td><span name="headlinerName">' + event.headliner.name + '</span></td>' + 
      '<td><span name="venueName">' + event.venue.name + '</span></td></tr>';
  }

  $('#jukely-booked-table tr:last').after(trHTML);
  $("#previousBookedText").hide();
}

function EncodeQueryData(data) {
   var ret = [];
   for (var d in data)
      ret.push(encodeURIComponent(d) + "=" + encodeURIComponent(data[d]));
   return ret.join("&");
}

window.onload = onWindowLoad;