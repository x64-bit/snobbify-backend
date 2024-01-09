/**
 * This is an example of a basic node.js script that performs
 * the Authorization Code oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/documentation/web-api/tutorials/code-flow
 */

var express = require('express');
var request = require('request');
var crypto = require('crypto');
var cors = require('cors');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var OpenAI = require('openai');
var SpotifyWebApi = require('spotify-web-api-node');
var HttpsProxyAgent = require('https-proxy-agent');

// import { HttpProxyAgent } from 'http-proxy-agent';

// import express from 'express';
// import request from 'request';
// import crypto from 'crypto';
// import cors from 'cors';
// import querystring from 'querystring';
// import cookieParser from 'cookie-parser';
// import OpenAI from 'openai';
// import SpotifyWebApi from 'spotify-web-api-node';
// import HttpsProxyAgent from 'https-proxy-agent';

// const spotifyApi = new SpotifyWebApi();

const client_id = process.env.SPOTIFY_CLIENT_ID; // your clientId
const client_secret = process.env.SPOTIFY_CLIENT_SECRET; // Your secret

const BACKEND_ROUTE = "https://snobbify-backend.onrender.com";
const FRONTEND_ROUTE =  "https://snobbify.onrender.com";
// const redirect_uri = 'http://localhost:8888/callback'; // Your redirect uri
const redirect_uri = BACKEND_ROUTE + '/callback'; // Your redirect uri


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  httpAgent: new HttpsProxyAgent.HttpsProxyAgent(FRONTEND_ROUTE)});

const generateRandomString = (length) => {
  return crypto
  .randomBytes(60)
  .toString('hex')
  .slice(0, length);
}

var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(__dirname + '/public'))
   .use(cors())
   .use(cookieParser())
   .use(express.json());

app.get('/login', function(req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = 'user-read-private user-read-email user-read-playback-state user-top-read';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

app.get('/callback', function(req, res) {

  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + (new Buffer.from(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {

        var access_token = body.access_token,
            refresh_token = body.refresh_token;

        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        // use the access token to access the Spotify Web API
        request.get(options, function(error, response, body) {
          console.log(body);
        });

        // we can also pass the token to the browser to make requests from there
        res.redirect(FRONTEND_ROUTE + '/#' +
          querystring.stringify({
            access_token: access_token,
            refresh_token: refresh_token
          }));
      } else {
        res.redirect(FRONTEND_ROUTE + '/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

app.get('/refresh_token', function(req, res) {

  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 
      'content-type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + (new Buffer.from(client_id + ':' + client_secret).toString('base64')) 
    },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token,
          refresh_token = body.refresh_token;
      res.send({
        'access_token': access_token,
        'refresh_token': refresh_token
      });
    }
  });
});

// ROASTING ENDPOINTS ------------------------

// used a POST request because didn't want to expose artists in URL
// and concerned about account data fiddling
app.post('/roastArtists', async function(req, res) {
  // TODO:  implement try/catch so server doesn't just crash lmfao
  // console.log(req.body);
  
  let topArtists = req.body.topArtists;
  let topArtistsStr = "{" + topArtists.join(", ") + "}";
  // console.log("generateRoast, topArtists:", topArtists);
  // console.log("generateRoast:",topArtistsStr);
  
  // console.log("sending to chatGPT...")
  const completion = await openai.chat.completions.create({
      messages: [
          { role: "system", content: process.env.ARTISTS_PROMPT },
          { role: "user", content: topArtistsStr}
      ],
      model: "gpt-3.5-turbo",
  });
  // console.log("finished!")
  // console.log(completion.choices[0]);

  res.send({
    gpt_response: completion.choices[0]
  })

  // console.log("GPT response:", completion.choices[0]);
});

// used a POST request because didn't want to expose artists in URL
// and concerned about account data fiddling
app.post('/roastTracks', async function(req, res) {
  // TODO:  implement try/catch so server doesn't just crash lmfao
  // console.log(req.body);
  
  let topTracks = req.body
  let topTracksStr = JSON.stringify(topTracks);
  // console.log("generateRoast, topArtists:", topTracks);
  // console.log("generateRoast:",topTracksStr);
  
  console.log("sending to chatGPT...")
  const completion = await openai.chat.completions.create({
      messages: [
          { role: "system", content: process.env.TRACKS_PROMPT },
          { role: "user", content: topTracksStr}
      ],
      model: "gpt-3.5-turbo",
  });
  console.log("finished!")
  console.log(completion.choices[0]);

  // res.send({
  //   gpt_response: completion.choices[0]
  //   // gpt_response: {"message" : { "content" : topTracksStr}}
  // })

  // console.log("GPT response:", completion.choices[0]);
});

/**
 * deprecated
 */
app.get('/getPlaying', async function(req, res) {
  const authHeader = req.header("Authorization");
  // console.log("Request:", req);
  // console.log("header:", authHeader)
  let accessToken = undefined
  // TODO: this is VERY insecure
  if (authHeader.startsWith("Bearer ")){
    accessToken = authHeader.substring(7, authHeader.length);
  } else {
    res.send(200);
  }
  console.log("Access token:", accessToken);

  // Set the credentials when making the request
  let spotifyApi = new SpotifyWebApi({
    accessToken: accessToken
  });


  console.log("Reading playback...")
  const spotifyRes = spotifyApi.getMyCurrentPlaybackState().then(
    function(data) {
      console.log("Playback data retrieved. Start of data:")
      console.log(data.body);
      console.log("End of data ---")

      const name = data.body.item.name;
      const albumArt = data.body.item.album.images[0].url;
      // console.log("again:",spotifyRes);
      console.log("name:", name);
      console.log("albumArt:", albumArt);

      // TODO: how to correctly send this data back??
      res.send({
        'name': name,
        'album_art': albumArt
      })
    },
    function(err) {
      console.log('Something went wrong!', err);
    }
  );
})

console.log('Listening on 8888');
app.listen(8888);
