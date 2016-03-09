var interestedEvents = [];
var bookedEvents = [];
var jukelyAccessToken = "";
var eventsCheckKeepGoing = true;
var jukelyCity = "new-york";

chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    //Set the jukelyAccessToken
    if (request.jukelyCheckerAction === "setAccessToken") {
      jukelyAccessToken = request.jukelyAccessToken;
      sendResponse({ message: "jukelyAccessToken set ok" });
    }

    if (request.jukelyCheckerAction === "updateJukelyCity") {
      jukelyCity = request.jukelyCity;
      sendResponse({ message: "jukelyCity set ok" });
    }

    if (request.jukelyCheckerAction === "getJukelyCity") {
      sendResponse({ jukelyCity: jukelyCity });
    }

    //Start checking for available events
    if (request.jukelyCheckerAction === "eventsCheckStart") {
      eventsCheckKeepGoing = true;
      sendResponse({ message: "starting events check ok" });
    }

    //Stop checking for available events
    if (request.jukelyCheckerAction === "eventsCheckStop") {
      eventsCheckKeepGoing = false;
      sendResponse({ message: "stopping events check ok" });
    }

    //Add event to interested events
    if (request.jukelyCheckerAction === "addInterestedEvent") {
      console.log("Adding event from array... before: " + interestedEvents.length);
      interestedEvents.push(request.interestedEvent);
      sendResponse({ message: "interested events added ok" });
      console.log("Adding event from array... after: " + interestedEvents.length);
    }

    //Remove event from interested events
    if (request.jukelyCheckerAction === "removeInterestedEvent") {
      console.log("Removing event from array... before: " + interestedEvents.length);
      interestedEvents = interestedEvents.filter(function (el) {
        return el.headlinerName !== request.interestedEvent.headlinerName && 
          el.venueName !== request.interestedEvent.venueName;
      });

      console.log("Removing event from array... after: " + interestedEvents.length);
      sendResponse({ message: "interested events removed ok" });
    }

    if (request.jukelyCheckerAction === "checkForInterestedEvents") {
      if (interestedEvents.length) {
        sendResponse({
          previousEvents: interestedEvents.length > 0,
          previousBooked: bookedEvents.length > 0
        });
      } else {
        sendResponse({
          previousEvents: false,
          previousBooked: false
        });
      }
    }
  });

function checkForEvents() {
  var http = new XMLHttpRequest();
  var url = "https://api.jukely.com/v5/metros/" + jukelyCity + "/events?tier=unlimited";

  http.open("GET", url, true);

  http.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
  http.setRequestHeader("Authorization", "Bearer " + jukelyAccessToken);
  http.responseType = 'json';

  http.onreadystatechange = function() {
    if (http.readyState == 4 && http.status == 200) {
      var events = http.response.events;
      var interested = [];
      var anyOpen = false;

      if (events) {

        //Success! Go through events...
        for (var i = 0; i < events.length; i++) {
          var event = events[i];
          var status = event.status === 1 ? "Open" : "Closed";
          var headliner = event.headliner;
          var venue = event.venue;

          for (var j = 0; j < interestedEvents.length; j++) {
            var interestedEvent = interestedEvents[j];
            if (venue.name === interestedEvent.venueName && headliner.name === interestedEvent.headlinerName) {
              event.numOfSpots = interestedEvent.numOfSpots;

              interestedEvent.numOfTimesChecked = interestedEvent.numOfTimesChecked + 1;
              event.numOfTimesChecked = interestedEvent.numOfTimesChecked;
              interested.push(event);
            }
          }
        }

        for (var i = 0; i < interested.length; i++) {
          var event = interested[i];
          var status = event.status === 1 ? "Open" : "Closed";
          if (status === "Open") {
            anyOpen = true;
          }
        }

        console.log(interested);
        if (!interested.length) {
          chrome.runtime.sendMessage({
            jukelyCheckerAction: "eventsChecked",
            interestedEvents: interestedEvents,
            bookedEvents: bookedEvents
          }, function(response) {
            console.log(response);
          });
        } else {
          chrome.runtime.sendMessage({
            jukelyCheckerAction: "eventsChecked",
            interestedEvents: interested,
            bookedEvents: bookedEvents
          }, function(response) {
            console.log(response);
          });
        }

        if (anyOpen) {
          for (var i = 0; i < interested.length; i++) {
            var event = interested[i];
            var status = event.status === 1 ? "Open" : "Closed";
            var headliner = event.headliner;
            var venue = event.venue;

            if (status === "Open") {
              console.log("BOOKING THE EVENT!");
              bookEvent(event);
            }
          }
        } else {
          //Event is still closed...
          console.log("event is closed");
        }
      }
    }
  };

  http.onerror = function() {
    errorCallback("Couldn't get events");
  };

  http.send(null);
}

function bookEvent(event) {
  var http = new XMLHttpRequest();
  var url = "https://api.jukely.com/v5/passes";
  var params = EncodeQueryData({ 
    "id": event.parse_id,
    "pass_count": event.numOfSpots
  });
  http.open("POST", url, true);

  http.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
  http.setRequestHeader("Authorization", "Bearer " + jukelyAccessToken);
  http.responseType = 'json';

  http.onreadystatechange = function() {
    if (http.readyState == 4 && http.status == 201) {
      if (http.response.pass && http.response.pass.event) {
        var bookedEvent = http.response.pass.event;

        interestedEvents = interestedEvents.filter(function (el) {
          return el.headlinerName !== bookedEvent.headliner.name && 
            el.venueName !== bookedEvent.venue.name;
        });
        
        bookedEvent.numOfTimesChecked = event.numOfTimesChecked;
        bookedEvent.numOfSpots = event.numOfSpots;

        bookedEvents.push(bookedEvent);
        chrome.runtime.sendMessage({
          jukelyCheckerAction: "eventBooked",
          interestedEvent: bookedEvent
        }, function(response) {
          console.log(response);
        });
      }
    }
  }
  http.onerror = function() {
    console.log("Couldn't book ticket");
  };

  http.send(params);
}

//Infinite loop to constantly check for open events and book interested ones
setInterval(function(){ 
  if (eventsCheckKeepGoing) {
    if (interestedEvents.length) {
      console.log("Checking for events!");
      checkForEvents();
    } else {
      console.log("No interested events... Not checking");
    }
  } else {
    console.log("Not checking for events!");
  }
}, 10000);

function EncodeQueryData(data) {
   var ret = [];
   for (var d in data)
      ret.push(encodeURIComponent(d) + "=" + encodeURIComponent(data[d]));
   return ret.join("&");
}