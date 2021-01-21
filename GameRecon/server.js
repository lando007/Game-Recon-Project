//Constants
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const app = express()
const fetch = require("node-fetch");
const apiKey = '35DD1F8971E5FF2184D4DEE678AC44D5';
const ScrapeRefreshTime = 900000; //Time between each AppList scrape - 15 Minutes
//

///Globals
let appList;
let appID;
let FinishedScrapingAppList = false;
let validSearch = false;
let appMap = new Map();
let appIDMap = new Map();
let UpCase_NameMap = new Map();
let playerCountText = "";
let reviewScoreDescText = "";
let totalPositiveText = "";
let totalNegativeText = "";
let totalReviewsText = "";
let gameNameText = "";
let gameDescriptionText = "";
let gameTypeText = "";
let parentWarningText = "";
let gameScoreText = "";
let URLforReview = "";
let MostHelpfulReviewText = "";
let MostFunnyReviewText = "";
let MostHelpfulReview;
let MostFunnyReview;
let FunnyReviewScoreText = "";
let HelpfulReviewScoreText ="";
let GameImageURLText = '';
let CommunityLinkText = "";
///

app.use(express.static('public'));
app.use(bodyParser.urlencoded({extended: true}));
app.set('view engine', 'ejs')

app.get('/', function (req, res) {
    res.render('index');
})

if (app.get('env') === 'development') {
    app.locals.pretty = true;
}


app.post('/', function (req, res) {
    let u_in = req.body.gameID;
    u_in = u_in.replace(/\s/g, '');
    console.log('User Inputted: ' + u_in);
    //console.log("Testing: " + NameOrID(u_in));
    DetermineAppID(u_in);

    let url_PlayerCount = `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?key=<apiKey>&appid=` + appID;
    let url_GameDetails = `https://store.steampowered.com/api/appdetails?appids=${appID}&format=json`;
    let url_GameReviews = `https://store.steampowered.com/appreviews/${appID}?json=1&num_per_page=100`;
    let url_PriceDetails = `https://store.steampowered.com/api/appdetails/?appids=${appID}&cc=us&filters=price_overview`

    if (validSearch) {
        Promise.all([fetch(url_PlayerCount), fetch(url_GameDetails), fetch(url_GameReviews)])
            .then(values => Promise.all(values.map(value => value.json())))
            .then(finalVals => {
                let API_playerCount = finalVals[0];
                let API_gameDetails = finalVals[1];
                let API_gameReviews = finalVals[2];
                //let API_concurrentPlayers = finalVals[3];
                GeneratePlayerCount(API_playerCount);
                GenerateGameDetails(API_gameDetails);
                GenerateGameReviews(API_gameReviews);
                //Send data to front end
                res.render('index', {
                    playerCount: playerCountText,
                    gameName: gameNameText,
                    gameDescription: gameDescriptionText,
                    gameWarning: parentWarningText,
                    gameType: gameTypeText,
                    gameScore: gameScoreText,
                    ReviewURL: URLforReview,
                    ID: appID,
                    reviewDesc: reviewScoreDescText,
                    totalPositive: totalPositiveText,
                    totalNegative: totalNegativeText,
                    MostRecentHelpfulReview: MostHelpfulReviewText,
                    MostRecentFunnyReview: MostFunnyReviewText,
					GameImageURL:GameImageURLText,
					CommunityLinkURL:CommunityLinkText
                });

            });
    } else {
        console.log("User entered incorrect game title");
        res.render('index', {error: "Incorrect Game Title Inputted"});
    }
	
	GameImageURLText = "https://steamcdn-a.akamaihd.net/steam/apps/";
	GameImageURLText += appID;
	GameImageURLText += "/header.jpg?";
	//console.log(GameImageURLText); debug
	
	CommunityLinkText = "https://steamcommunity.com/app/" + appID;
	//console.log(CommunityLinkText);

})


///
//Description: Get the player count from api call of the app id
///
function GeneratePlayerCount(playerCount) {
    if (playerCount.response.player_count == undefined) {
        res.render('index', {
            playerCount: null,
            error: 'Error: Inputted game name is incorrect or game does not exist.'
        });
    } else {
        playerCountText = "Players Online: " + playerCount.response.player_count;
    }
}

///
//Description: Get the game details of the app id
///
function GenerateGameDetails(gameDetails) {
    if (gameDetails[appID].data != undefined) {
        gameNameText = "Game Name: " + gameDetails[appID].data.name;
        gameDescriptionText = gameDetails[appID].data.detailed_description;
        gameTypeText = gameDetails[appID].data.type;
        parentWarningText = gameDetails[appID].data.content_descriptors.notes;
        gameScoreText = "";
        URLforReview = "";
        if (gameDetails[appID].data.metacritic != undefined) {
            gameScoreText = gameDetails[appID].data.metacritic.score;
            URLforReview = gameDetails[appID].data.metacritic.url;
        }
    }
}

///
//Description: Get and parse the data from the Game Reviews API call
//for the specific app id
///
function GenerateGameReviews(gameReviews) {
    if (gameReviews.query_summary != undefined) {
        reviewScoreDescText = "Game Rating: " + gameReviews.query_summary.review_score_desc;
        totalPositiveText = "Total positive reviews: " + gameReviews.query_summary.total_positive;
        totalNegativeText = "Total negative reviews: " + gameReviews.query_summary.total_negative;
        totalReviewsText = "Total number of reviews: " + gameReviews.query_summary.total_reviews;

        /// Grab the Most Helpful Game Review & Most Funny Game Review
        ///We do this by finding The most helpful game review from the gameReviews list
        ///Once found, we remove it from the list and call the function again to get the next highest rated review
        ///We can do this as much as many times as there are items in the list
        MostHelpfulReview = FindMostHelpfulReview(gameReviews);
        if(MostHelpfulReview != undefined){
            HelpfulReviewScoreText = MostHelpfulReview.votes_up;
            MostHelpfulReviewText = `"` + MostHelpfulReview.review + `" - Helpful-Review Score: ` + HelpfulReviewScoreText;
            gameReviews.reviews.splice(gameReviews.reviews.indexOf(MostHelpfulReview),1); //Remove the review from the reviews list
        }
        else{
            MostHelpfulReviewText = "No Review Available... Helpful-Review Score: N/A";
            HelpfulReviewScoreText = 0;
        }

        MostFunnyReview = FindMostFunnyReview(gameReviews);
        if(MostFunnyReview != undefined) {
            FunnyReviewScoreText = MostFunnyReview.votes_funny;
            MostFunnyReviewText = `"` + MostFunnyReview.review + `" - Funny-Review Score: ` + FunnyReviewScoreText;
            gameReviews.reviews.splice(gameReviews.reviews.indexOf(MostFunnyReview), 1); //Remove the review from the reviews list
        }
        else{
            MostFunnyReviewText = "No Review Available... Funny-Review Score: N/A";
            FunnyReviewScoreText = 0;
        }


    }
}


///
//Description: Takes the last 100 reviews from a game and searches for the most helpful review
//              in a given array
//              Then returned, remove from the given list and call again to get the next highest review
///
function FindMostHelpfulReview(gameReviews){
    if(gameReviews == undefined)
        return;
    if(gameReviews.reviews[0] == undefined)
        return;
    let currentScore = gameReviews.reviews[0].votes_up;
    let MostHelpfulReview = gameReviews.reviews[0];
    for (let i = 0; i < gameReviews.reviews.length; i++) {
        //gameReviews.reviews[i].review +
        //console.log("      " + gameReviews.reviews[i].votes_up + "   " + gameReviews.reviews[i].votes_funny);
        if(currentScore <= gameReviews.reviews[i].votes_up){
            MostHelpfulReview = gameReviews.reviews[i];
            currentScore = gameReviews.reviews[i].votes_up;

        }
    }
    //console.log(gameReviews.reviews.length + "  Number of reviews2222");
    //console.log("Resulting Highest Review: " + MostHelpfulReview.review + "   Score" + MostHelpfulReview.votes_up + "   Voted Up: " + MostHelpfulReview.voted_up);
    if(MostHelpfulReview.votes_up == undefined)
        return undefined;
    return MostHelpfulReview;
}

///
//Description: Takes the last 100 reviews from a game and searches for the most funny review
//              in a given array
//              Then returned, remove from the given list and call again to get the next highest review
///
function FindMostFunnyReview(gameReviews){
    if(gameReviews == undefined)
        return;
    if(gameReviews.reviews[0] == undefined)
        return;
    let currentScore = gameReviews.reviews[0].votes_funny;
    let MostFunnyReview = gameReviews.reviews[0];
    for (let i = 0; i < gameReviews.reviews.length; i++) {
        //gameReviews.reviews[i].review +
        //console.log("      " + gameReviews.reviews[i].votes_up + "   " + gameReviews.reviews[i].votes_funny);
        if(currentScore <= gameReviews.reviews[i].votes_funny){
            MostFunnyReview = gameReviews.reviews[i];
            currentScore = gameReviews.reviews[i].votes_funny;

        }
    }
    //console.log(gameReviews.reviews.length + "  Number of reviews2222");
    //console.log("Resulting Funniest Review: " + MostFunnyReview.review + "   Score" + MostFunnyReview.votes_funny + "   Voted Up: " + MostFunnyReview.voted_up);
    if(MostFunnyReview.votes_funny == undefined)
        return undefined;
    return MostFunnyReview;
}


////
//Description: Returns true if the user inputted an app ID
//				Returns false if the user inputted a Game Title
////
function NameOrID(input) {
    //console.log("ui = "+ input);
    var isName = new RegExp(/[A-Za-z]+/);
    return !isName.test(input);
}

///
//Description: Sets the app ID for the API search from the user input
//          If the user enters a number, see the app ID to the input straight away
//              Also, set the validSearch flag to true
//          Otherwise, the user searched a game title. Find the game title in the appMap.
//              If it finds one, set the corresponding appID
//                  Also set the validSearch flag to true.
//              Otherwise, the user has entered an incorrect Game Title
///
function DetermineAppID(u_inp) {
    if (NameOrID(u_inp)) {
        if (appIDMap.has(parseInt(u_inp, 10))) {
            appID = u_inp;
            validSearch = true
        } else {
            validSearch = false
        }

    } else if (UpCase_NameMap.has(u_inp.toUpperCase())) {
        validSearch = true;
        appID = appMap.get(UpCase_NameMap.get(u_inp.toUpperCase()));
    } else
        validSearch = false;


}

///
//Description: Goes through the getAppList API call and maps the
//Game title to its corresponding app ID.
//This will be used when searching for games using their names rather than app id
///
function ScrapeAppList() {
    let doOnce = true;
    if (doOnce) {
        doOnce = false;
        let url_AllSteamApps = `https://api.steampowered.com/ISteamApps/GetAppList/v2?&formatjson`;
        //Request List of games Here
        request(url_AllSteamApps, function (err, response, body) {
            if (err) {
                console.log("error", error);
            } else {
                appList = JSON.parse(body);
                for (var key in appList.applist.apps) {
                    if (appList.applist.apps.hasOwnProperty(key)) {
                        var name_key = appList.applist.apps[key].name;
                        var UC_name_key = name_key.toUpperCase();
                        var appid_val = appList.applist.apps[key].appid
                        UC_name_key = UC_name_key.replace(/\s/g, '');
                        appMap.set(name_key, appid_val);
                        appIDMap.set(appid_val, name_key);
                        UpCase_NameMap.set(UC_name_key, name_key);
                        //console.log("Name: " + appid_val + "    ID: " + name_key + "   KEY: " + key + "\n");
                    }
                }
                FinishedScrapingAppList = true;
                console.log("GameRecon scraped a total of " + appList.applist.apps.length + " apps");
                console.log("GameRecon has finished Scraping AppList...");
            }
        });

    }
}

let firstScrape = false;
//On Page load this is called
app.listen(3000, function () {
    console.log('Example app listening on port 3000!');

    //The first thing we do is generate the maps for our search functionalities
    //This will generate the appMap, appIDMap, UpCase_NameMap
    //Users should not be able to search until this function is completed entirely
    //The flag, FinishedScrapingAppList will be set to true on completion
    ////We call this continously every 10 minutes
    ////This is due to new apps being added into the API that we need to add into our database.
    if (!firstScrape){
        ScrapeAppList();
        firstScrape = true;
    }
    setInterval(ScrapeAppList, ScrapeRefreshTime);

})