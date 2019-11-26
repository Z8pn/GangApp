var Promise = require('promise');
var request = require('request');
var crypto = require('crypto');
var fs = require('fs');
/* Express stuff */
var compression = require('compression');
var express = require('express');
var helmet = require('helmet');
var session = require('express-session');
var MemoryStore = require('memorystore')(session)
var sharedsession = require("express-socket.io-session");
var async = require('async');
var rateLimit = require("express-rate-limit");
var GoogleSpreadsheet = require('google-spreadsheet');
/***************************************
                Setup
***************************************/
// Express & Socket.io
var app = express();
var server = app.listen(7464);
var io = require('socket.io')(server);
// Compression, and helmet module for hsts etc
app.use(helmet());
app.use(compression());
var signInLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 3
});
var session_middleware = session({
    secret: "jkpoasdfipu42t5",
    name: "session",
    resave: true,
    saveUninitialized: true,
    store: new MemoryStore({
        checkPeriod: 86400000
    }),
});
app.use(session_middleware);
io.use(sharedsession(session_middleware, {
    autoSave: true
}));
// adding our passport session to the session_middleware
// Login
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});
/**************************/
/**************************/
var gang_aktionen = []
var aktions_gruppen = []
/**************************/
var accounts = [];
var admins = [];
var max_lobby_age = 2 * 60 * 60 * 1000;
/**************************/
var Logins = [];
var Names = [];
var Lobbies = [];
app.get('/actions', function(req, res) {
    res.json({
        actions: gang_aktionen,
        groups: aktions_gruppen
    })
})
app.get('/logout', function(req, res) {
    console.log("Logged out", req.session.username);
    req.session.destroy();
    res.redirect('/');
})
app.post('/login', function(req, res) {
    let username = req.query.username;
    let password = req.query.password;
    console.log("login try", username)
    if ((gang_aktionen.length > 0) && (aktions_gruppen.length > 0)) {
        if (accounts[username]) {
            let pass = accounts[username]
            if (password == pass) {
                req.session.username = username;
                req.session.save()
                Logins[req.sessionID] = req.session.username;
                res.json({
                    success: true,
                    key: req.sessionID,
                    admin: admins[req.session.username]
                });
            } else {
                res.json({
                    success: false
                });
            }
        }
    }
});
io.sockets.on('connection', function(socket) {
    console.log("connect");
    if ((socket.handshake.query.key)) {
        let key = socket.handshake.query.key;
        socket.handshake.sessionID = key;
        let NickName = Logins[socket.handshake.sessionID];
        Names[NickName] = socket;
        console.log("socket.handshake.query", socket.handshake.query);
        console.log("socket.handshake.sessionID", socket.handshake.sessionID);
        socket.emit(socket.handshake.session);
        socket.on('disconnect', function() {
            console.log(socket.handshake.sessionID + ' has disconnected from the chat.' + socket.id);
            Logins[socket.handshake.sessionID] = null;
            delete Logins[socket.handshake.sessionID];
        });
        socket.on('latency', function(fn) {
            fn();
        });
        socket.on('requestUpdate', function(fn) {
            let lobby = Object.keys(Lobbies).map(function(name) {
                return {
                    id: name,
                    players: Lobbies[name].players,
                    type: Lobbies[name].type,
                    started: Lobbies[name].started,
                    host: Lobbies[name].host
                }
            })
            socket.emit('push', {
                userCount: Object.keys(Logins).length,
                lobbies: JSON.stringify(lobby)
            });
        });
        socket.on('joinEvent', function(data, fn) {
            console.log("data", data);
            if (Lobbies[data.roomID]) {
                console.log("isInRoom", Lobbies[data.roomID].players.indexOf(NickName));
                if (Lobbies[data.roomID].players.indexOf(NickName) == -1) {
                    if (NickName != null) {
                        Lobbies[data.roomID].players.push(NickName);
                        console.log("joined room", NickName);
                        fn({
                            success: true
                        });
                    }
                }
            }
            fn({
                success: false
            });
        });
        socket.on('leaveEvent', function(data, fn) {
            console.log("data", data);
            if (Lobbies[data.roomID]) {
                console.log("isInRoom", Lobbies[data.roomID].players.indexOf(NickName));
                if (Lobbies[data.roomID].players.indexOf(NickName) > -1) {
                    Lobbies[data.roomID].players.splice(Lobbies[data.roomID].players.indexOf(NickName), 1)
                    console.log("leave room", NickName);
                    fn({
                        success: true
                    });
                }
            }
            fn({
                success: false
            });
        });
        socket.on('updateEvent', function(data, fn) {
            console.log("data", data);
            if (Lobbies[data.roomID]) {
                if ((Lobbies[data.roomID].host == NickName) || (admins[NickName] == 1)) {
                    if (data.remember == true) {
                        let host = Lobbies[data.roomID].host;
                        let players = Lobbies[data.roomID].players;
                        setTimeout(function() {
                            let nID = createEvent(host, players);
                            fn(nID);
                        }, 200)
                    }
                    editEvent(data.roomID, data.remember, data.action)
                }
            }
        });
        socket.on('editEvent', function(data, fn) {
            console.log("editEvent", data);
            if (Lobbies[data.roomID]) {
                if ((Lobbies[data.roomID].host == NickName) || (admins[NickName] == 1)) {
                    let s = changeType(data.roomID, data.type)
                    fn(s)
                }
            }
        });
        socket.on('removeEventMember', function(data, fn) {
            console.log("data", data);
            if (Lobbies[data.roomID]) {
                if ((Lobbies[data.roomID].host == NickName) || (admins[NickName] == 1)) {
                    let i = Lobbies[data.roomID].players.indexOf(data.name);
                    if (i > -1) {
                        Lobbies[data.roomID].players.splice(i, 1);
                        pushMessages();
                        fn({
                            success: true,
                            name: data.name
                        })
                    } else {
                        fn({
                            success: false
                        })
                    }
                } else {
                    fn({
                        success: false
                    })
                }
            } else {
                fn({
                    success: false
                })
            }
        });
        socket.on('createEvent', function(data, fn) {
            let id = createEvent(NickName, [])
            fn(id)
        });
    }
})
var nID = function() {
    return '_' + Math.random().toString(36).substr(2, 9);
};

function changeType(id, nType) {
    if (Lobbies[id]) {
        Lobbies[id].type = nType;
        pushMessages();
        return true;
    }
    return false;
}

function createEvent(host, members) {
    let i = Object.keys(Lobbies).filter(function(name) {
        return Lobbies[name].host == host;
    }).length;
    if (i <= 1) {
        if (host != null) {
            console.log(i, "create");
            console.log("create");
            console.log(host, members);
            let id = nID()
            console.log("new id", id);
            if (members.indexOf(host) == -1) {
                members.push(host);
            }
            Lobbies[id] = {
                players: members,
                type: "null",
                started: Date.now(),
                host: host
            }
            return id;
        }
    }
    return false
}

function editEvent(roomID, remember, type) {
    console.log("edit event", roomID);
    console.log("remember event", remember);
    console.log("type event", type);
    if (Lobbies[roomID]) {
        console.log("exists");
        if (type == "success") {
            saveEvent(roomID);
        }
        if (type == "fail") {
            deleteEvent(roomID);
        }
    }
}

function deleteEvent(id) {
    Lobbies[id] = null;
    delete Lobbies[id];
    pushMessages();
}
var sheet_data = {
    sheet: null,
    ready: false
}
var refundable = [];

function timeConverter(UNIX_timestamp) {
    var a = new Date(UNIX_timestamp * 1000);
    var year = a.getFullYear();
    var month = a.getMonth() + 1;
    var date = a.getDate();
    var hour = a.getHours();
    var min = a.getMinutes();
    var sec = a.getSeconds();
    var time = date + ' ' + month + ' ' + year + ' ' + hour + ':' + min + ':' + sec;
    return time;
}

function saveEvent(id) {
    Lobbies[id].players.forEach(function(player) {
        Names[player].emit('notify', {
            title: "Lobby",
            message: "wird gespeichert.."
        });
    })
    let data = Lobbies[id];
    if (data != undefined) {
        Lobbies[id] = null;
        delete Lobbies[id];
        pushMessages();
        let refund = "-";
        if (refundable.indexOf(data.type) > -1) {
            refund = data.host;
        }
        // add to spreadsheet
        var new_data = {
            "Zeitstempel": timeConverter(Date.now() / 1000),
            "Aktion": data.type,
            "Rueckerstattung": refund,
            "Teilnehmer0": data.players[0] || "",
            "Teilnehmer1": data.players[1] || "",
            "Teilnehmer2": data.players[2] || "",
            "Teilnehmer3": data.players[3] || "",
            "Teilnehmer4": data.players[4] || "",
            "Teilnehmer5": data.players[5] || "",
            "Teilnehmer6": data.players[6] || "",
            "Teilnehmer7": data.players[7] || "",
            "Teilnehmer8": data.players[8] || "",
            "Teilnehmer9": data.players[9] || "",
            "Teilnehmer10": data.players[10] || "",
            "Teilnehmer11": data.players[11] || "",
            "Teilnehmer12": data.players[12] || "",
            "Teilnehmer13": data.players[13] || "",
            "Teilnehmer14": data.players[14] || "",
            "Teilnehmer15": data.players[15] || "",
            "Teilnehmer16": data.players[16] || "",
            "Teilnehmer17": data.players[17] || "",
            "Teilnehmer18": data.players[18] || "",
            "Teilnehmer19": data.players[19] || "",
            "Teilnehmer20": data.players[20] || "",
            "Teilnehmer21": data.players[21] || "",
            "Teilnehmer22": data.players[22] || "",
            "Teilnehmer23": data.players[23] || "",
            "Teilnehmer24": data.players[24] || "",
            "Teilnehmer25": data.players[25] || "",
            "Teilnehmer26": data.players[26] || "",
            "Teilnehmer27": data.players[27] || "",
            "Teilnehmer28": data.players[28] || "",
            "Teilnehmer29": data.players[29] || "",
            "Teilnehmer30": data.players[30] || "",
            "Teilnehmer31": data.players[31] || "",
            "Teilnehmer32": data.players[32] || "",
            "Teilnehmer33": data.players[33] || "",
            "Teilnehmer34": data.players[34] || "",
            "Teilnehmer35": data.players[35] || "",
            "Teilnehmer36": data.players[36] || "",
            "Teilnehmer37": data.players[37] || "",
            "Teilnehmer38": data.players[38] || "",
            "Teilnehmer39": data.players[39] || "",
            "Teilnehmer40": data.players[40] || ""
        };
        console.log("new_data", new_data);
        sheet_data.sheet.addRow(new_data, (err, data) => {
            console.log("err", err);
        });
    }
}
var doc = new GoogleSpreadsheet(''); // spreadsheet id zum eintragen

function setAuth() {
    var creds_json = require('./data.json')
    doc.useServiceAccountAuth(creds_json, () => {
        doc.getInfo((err, data) => {
            data.worksheets.forEach(function(sheet) {
                if (sheet.title == "Eintrage_Matrix") {
                    sheet_data.sheet = sheet;
                    sheet_data.ready = true;
                    console.log("Spreadsheet Ready")
                }
            })
        })
    });
}
setAuth();

function loadAccounts() {
    var account_docs = new GoogleSpreadsheet(''); // spreadsheet für accounts
    var creds_json = require('./data.json') // auth data
    account_docs.useServiceAccountAuth(creds_json, () => {
        account_docs.getInfo((err, data) => {
            console.log("err", err)
            data.worksheets.forEach(function(sheet) {
                if (sheet.title == "Login Daten") {
                    sheet.getRows({
                        offset: 1
                    }, function(err, rows) {
                        console.log('Loading ' + rows.length + ' accounts');
                        accounts = [];
                        admins = [];
                        rows.forEach(function(entry) {
                            accounts[entry.loginname] = entry.passwort;
                            admins[entry.loginname] = entry.admin;
                        })
                        console.log("Accounts Updated")
                    });
                }
            })
        })
    });
}
loadAccounts();

function LoadActions() {
    var action_docs = new GoogleSpreadsheet(''); // spreadsheet für accounts
    var creds_json = require('./data.json') // auth data
    action_docs.useServiceAccountAuth(creds_json, () => {
        action_docs.getInfo((err, data) => {
            data.worksheets.forEach(function(sheet) {
                if (sheet.title == "Gruppen") {
                    sheet.getRows({
                        offset: 1
                    }, function(err, rows) {
                        console.log('Loading ' + rows.length + '');
                        aktions_gruppen = [];
                        rows.forEach(function(entry) {
                            aktions_gruppen.push({
                                name: entry.gruppe,
                                image: entry.image,
                                group: entry.gruppe
                            })
                        })
                    });
                }
                if (sheet.title == "Aktionen") {
                    sheet.getRows({
                        offset: 1
                    }, function(err, rows) {
                        console.log(err);
                        console.log('Loading ' + rows.length + '');
                        gang_aktionen = [];
                        refundable = [];
                        rows.forEach(function(entry) {
                            if (entry.gruppe != "") {
                                if (entry.rueckerstattung != "-") {
                                    refundable.push(entry.eindeutigebezeichnung)
                                }
                                gang_aktionen.push({
                                    name: entry.untergruppe,
                                    image: entry.bildurl,
                                    type: entry.eindeutigebezeichnung,
                                    group: entry.gruppe,
                                    desc: entry.tooltip,
                                    icon: entry.icon
                                })
                            }
                        })
                    });
                }
            })
        })
    });
}
LoadActions();
setInterval(function() {
    loadAccounts();
    LoadActions();
}, 10 * 60 * 1000)

function pushMessages() {
    let lobby = Object.keys(Lobbies).map(function(name) {
        return {
            id: name,
            players: Lobbies[name].players,
            type: Lobbies[name].type,
            started: Lobbies[name].started,
            host: Lobbies[name].host
        }
    })
    let oldLobby = lobby.filter(function(l) {
        return (l.started + max_lobby_age) < Date.now();
    })[0];
    if (oldLobby) {
        console.log("oldLobby", oldLobby);
        Lobbies[oldLobby.id] = null;
        delete Lobbies[oldLobby.id];
        pushMessages();
    }
    io.sockets.emit('push', {
        userCount: Object.keys(Logins).length,
        lobbies: JSON.stringify(lobby)
    });
}
setInterval(function() {
    pushMessages()
}, 1000)
app.get('*', function(req, res) {
    res.send('error 404');
});
app.post('*', function(req, res) {
    res.redirect('/');
});