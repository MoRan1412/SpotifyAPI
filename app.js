'use strict'

const express = require('express')
const app = express()
const bodyParser = require('body-parser')
const rand = require('csprng');
const request = require('request');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');
const querystring = require('querystring');
const cookieParser = require('cookie-parser');

app.use(bodyParser.json()); //Used to parse JSON bodies
app.use(bodyParser.urlencoded({ extended: true })); //Parse URL-encoded bodies

const status = {
    OK: 200,
    CREATED: 201,
    NOT_MODIFIED: 304,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500,
};

const client_id = '043554bcb0fa47d9ac24bb03f7d1a043'; // your clientId
const client_secret = '72316943cc3949b7bd143021fe1a2d2b'; // Your secret
const redirect_uri = 'http://localhost:3000/callback'; // Your redirect uri

const generateRandomString = (length) => {
    return crypto
        .randomBytes(60)
        .toString('hex')
        .slice(0, length);
}

const stateKey = 'spotify_auth_state';

app.use(express.static(__dirname + '/public'))
    .use(cors())
    .use(cookieParser());

const maxAge = 1000 * 60 * 60


const port = 3000
app.listen(port, () => {
    console.log(`App listening on port ${port}`)
})

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.get('/login', function (req, res) {

    const state = generateRandomString(16);
    res.cookie(stateKey, state);

    const scope = 'user-read-private user-read-email';
    res.redirect('https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code',
            client_id: client_id,
            scope: scope,
            redirect_uri: redirect_uri,
            state: state
        }));
});


app.get('/callback', async (req, res) => {

    const code = req.query.code || null;
    const state = req.query.state || null;
    const storedState = req.cookies ? req.cookies[stateKey] : null;

    if (state === null || state !== storedState) {
        res.status(status.INTERNAL_SERVER_ERROR).send({ error: 'state_mismatch' });
    } else {
        res.clearCookie(stateKey);
        try {
            const authResponse = await axios.post('https://accounts.spotify.com/api/token', {
                code: code,
                redirect_uri: redirect_uri,
                grant_type: 'authorization_code'
            }, {
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    Authorization: 'Basic ' + (new Buffer.from(client_id + ':' + client_secret).toString('base64'))
                }
            });

            const access_token = authResponse.data.access_token;
            const refresh_token = authResponse.data.refresh_token;

            const userResponse = await axios.get('https://api.spotify.com/v1/me', {
                headers: { 'Authorization': 'Bearer ' + access_token }
            });

            console.log(userResponse.data);

            res.cookie('access_token', access_token, { maxAge: maxAge, httpOnly: true });
            res.cookie('refresh_token', refresh_token, { maxAge: maxAge, httpOnly: true });

            res.status(status.OK).send({ access_token, refresh_token });
        } catch (error) {
            console.error(error);
            res.status(status.INTERNAL_SERVER_ERROR).send({ error: 'invalid_token' });
        }
    }
});

app.get('/refresh_token', async (req, res) => {
    try {
        const authResponse = await axios.post('https://accounts.spotify.com/api/token', {
            grant_type: 'refresh_token',
            refresh_token: req.cookies['refresh_token']
        }, {
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + (new Buffer.from(client_id + ':' + client_secret).toString('base64'))
            }
        });
        console.log(authResponse.data);
        const access_token = authResponse.data.access_token;
        const newRefresh_token = authResponse.data.refresh_token;
        res.cookie('access_token', access_token, { maxAge: maxAge, httpOnly: true });
        res.cookie('refresh_token', newRefresh_token, { maxAge: maxAge, httpOnly: true });
        res.send({
            'access_token': access_token,
            'refresh_token': newRefresh_token
        });
    } catch (error) {
        console.error(error);
        res.status(status.INTERNAL_SERVER_ERROR).send({ error: 'refresh_token_error' });
    }
});

app.get('/getProfile', async function (req, res) {
    console.log(`Get profile data`);
    const accessToken = req.cookies['access_token'];
    const response = await fetch('https://api.spotify.com/v1/me', {
        headers: {
            Authorization: 'Bearer ' + accessToken
        }
    });

    const data = await response.json();
    res.status(status.OK).send({ data });
});

app.get('/getTrack/:id', async function (req, res) {
    console.log(`Get track data`);
    const accessToken = req.cookies['access_token'];
    const response = await fetch(`https://api.spotify.com/v1/tracks/${req.params.id}`, {
        headers: {
            Authorization: 'Bearer ' + accessToken
        }
    });

    const data = await response.json();
    res.status(status.OK).send({ data });
})