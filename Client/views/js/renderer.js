// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
var $ = require('./jquery-3.1.1.min.js');
var io = require('./socket.io.js');
var iziToast = require('./iziToast.min.js');
var request = require('request');
var Store = require('electron-store');
var user_storage = new Store();
var socketAddress = "ws://localhost:7464";
var restAddress = "localhost:7464"
/*
var socketAddress = "ws://www.z8pn.com:7463";
var restAddress = "www.z8pn.com:7463"*/
const app = require('electron').remote.app;
/*var action_types = [];
 */
var groups = []
var action_types = []
var hasLoaded = false;
$.getJSON("http://" + restAddress + "/actions", function(data) {
    groups = data.groups;
    action_types = data.actions;
    hasLoaded = true;
}).fail(function() {
    app.exit();
})
var Requests = new class {
    constructor() {
        this._setup();
    }
    _setup() {
        this.cookies = request.jar();
    }
    post(url, params, callback) {
        request.post({
            jar: this.cookies,
            url: "http://" + restAddress + "/" + url,
            qs: params
        }, callback)
    }
    get(url, params, callback) {
        request.get({
            jar: this.cookies,
            url: "http://" + restAddress + "/" + url,
            qs: params
        }, callback)
    }
}
var Account = new class {
    constructor() {
        this._setup();
    }
    _setup() {
        this.signin = false;
        this.session_id = "";
        this.username = "";
        this.password = "";
        this.salt = "";
        this._admin = false;
    }
    get admin() {
        return this._admin;
    }
    get key() {
        return this.session_id;
    }
    get User() {
        return this.username;
    }
    generateSalt() {
        var text = "";
        var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (var i = 0; i < 15; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
        return text;
    }
    getFieldValues() {
        return {
            username: $("#join_username").val(),
            password: $("#join_password").val()
        }
    }
    hide() {
        $("#signin").hide();
    }
    show() {
        $("#signin").show();
    }
    login() {
        var self = this;
        console.log("login");
        let vals = self.getFieldValues();
        self.username = vals.username;
        self.password = vals.password;
        if (self.password.length < 3) {
            if ($("#join_password").hasClass("invalid") == false) {
                $("#join_password").removeClass("valid");
                $("#join_password").addClass("invalid");
            }
        } else {
            $("#join_password").removeClass("invalid");
            $("#join_password").addClass("valid");
        }
        if ($("#join_password").hasClass("invalid") == false) {
            Requests.post("login", {
                "username": self.username,
                "password": self.password
            }, function(err, httpResponse, body) {
                if (!err) {
                    body = JSON.parse(body);
                    console.log(body);
                    if (body.success == true) {
                        SocketClass.ready = true;
                        self.signin = true;
                        self.session_id = body.key;
                        Account.hide();
                        Lobby.show();
                        document.title = "Aktions Tracker [" + self.username + "]"
                        user_storage.set('username', self.username);
                        user_storage.set('password', self.password);
                        if (body.admin) {
                            self._admin = body.admin;
                        }
                    }
                }
            })
        } else {
            this.alert("Bitte Passwort überprüfen")
        }
    }
    alert(text) {
        $("#alert").show();
        $("#alert_text").addClass("shake");
        $("#alert_text").text(text);
        setTimeout(function() {
            $("#alert_text").removeClass("shake");
        }, 500)
    }
}
var SocketClass = new class {
    constructor() {
        this._setup();
    }
    _setup() {
        this._ready = false;
        this.connected = false;
        this.connection = null;
        this.timer = null;
    }
    set ready(rdy) {
        this._ready = rdy;
    }
    get ready() {
        return this._ready;
    }
    disconnect() {
        clearInterval(this.timer);
    }
    connect() {
        var self = this;
        if (self.ready == true) {
            self.connection = io.connect(socketAddress, {
                query: "key=" + Account.key
            });
            self.connection.on('connect', function() {
                console.log("Connected to Polling Server");
                self.connected = true;
            });
            self.connection.on('push', function(data) {
                $("#userCount").text(data.userCount + " User")
                Lobby.load(JSON.parse(data.lobbies))
            });
            self.connection.on('notify', function(data) {
                console.log("notify");
                iziToast.show({
                    title: '<strong>' + data.title + '</strong>',
                    titleColor: 'rgb(232, 232, 232)',
                    titleSize: '16px',
                    message: data.message,
                    theme: 'dark',
                    position: 'bottomRight',
                    timeout: 5000
                });
            });
            self.connection.on('disconnected', function() {
                SocketClass.ready = false;
                self.signin = false;
                self.session_id = "";
                Account.show();
                Lobby.hide();
                self.disconnect();
            });
            self.timer = setInterval(function() {
                let startTime = Date.now();
                self.connection.emit('latency', function() {
                    let latency = Date.now() - startTime;
                    $("#latency").text(latency + "ms")
                });
            }, 10000);
        }
    }
    emit(...args) {
        var self = this;
        if ((self.connection) && (self.connected)) {
            return self.connection.emit(...args);
        }
    }
};

function timeConverter(UNIX_timestamp) {
    var a = new Date(UNIX_timestamp * 1000);
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var year = a.getFullYear();
    var month = months[a.getMonth()];
    var date = a.getDate();
    var hour = a.getHours();
    var min = a.getMinutes();
    var sec = a.getSeconds();
    var time = date + ' ' + month + ' ' + year + ' ' + hour + ':' + min + ':' + sec;
    return time;
}
var Lobby = new class {
    constructor() {
        this._setup();
    }
    _setup() {
        this.lobbies = [];
        this.remember = false;
        this.lobby_members = [];
    }
    getMembers(id) {
        return this.lobby_members[id] || false
    }
    load(data) {
        this.lobbies = data;
        this.view();
    }
    resetContext() {
        this.remember = false;
    }
    view() {
        var self = this;
        let html = "";
        this.lobbies.forEach(function(l_inst) {
            console.log(l_inst);
            if (l_inst.type != "null") {
                self.lobby_members[l_inst.id] = l_inst.players;
                let a = action_types.filter(function(l) {
                    return l.type == l_inst.type;
                })[0];
                console.log("a", a);
                if (a) {
                    let joined = l_inst.players.indexOf(Account.User)
                    html += '<div class="lobby_group ' + (joined > -1 ? 'joined' : '') + '" data-group="' + a.group + '" data-id="' + l_inst.id + '" data-joined="' + (joined > -1 ? 'true' : 'false') + '">'
                    html += '<div class="prompt_join">'
                    html += 'Beitreten'
                    html += '</div>'
                    html += ' <div class="info">'
                    html += '<div class="type">'
                    html += '' + a.name + ''
                    html += '</div>'
                    html += '<div class="host">'
                    html += '<span>Host:</span>' + l_inst.host + ' ' + (l_inst.host == Account.User ? "<span>(Ich)</span>" : "")
                    html += '</div>'
                    html += '<div class="started">'
                    html += '<span>' + timeConverter(l_inst.started / 1000) + '</span>'
                    html += '</div>'
                    html += '<div class="players">'
                    html += '<div class="headline">Teilnehmer (' + l_inst.players.length + ') :</div>'
                    html += '<div class="player_list">'
                    l_inst.players.forEach(function(player) {
                        html += '<span>- ' + player + '</span>'
                    })
                    html += '</div>'
                    html += '</div>'
                    html += '</div>'
                    html += '<div class="icon ' + l_inst.type + '">'
                    html += a.icon
                    html += '</div>'
                    html += '</div>'
                }
            }
        })
        let i = this.lobbies.filter(function(lob) {
            return ((lob.host == Account.User) && (lob.type != "null"));
        }).length
        if (i <= 1) {
            html += '<div class="lobby_group new">'
            html += '<div class="plus">'
            html += '<i class="fas fa-plus"></i>'
            html += '</div>'
            html += '</div>'
        }
        $("#lobby_list").html(html);
    }
    show() {
        console.log("ok");
        $("#lobby").show();
        SocketClass.connect();
    }
    hide() {
        $("#lobby").hide();
    }
    leave(id) {
        SocketClass.emit("leaveEvent", {
            roomID: id
        }, function(data) {
            console.log("data", data)
            if (data.success == true) {
                iziToast.show({
                    title: '<strong>Lobby</strong>',
                    titleColor: 'rgb(232, 232, 232)',
                    titleSize: '16px',
                    message: 'verlassen',
                    theme: 'dark',
                    position: 'bottomRight',
                    timeout: 5000
                });
            } else {
                iziToast.show({
                    title: '<strong>Fehler</strong>',
                    titleColor: 'rgb(232, 232, 232)',
                    titleSize: '16px',
                    message: 'Verlassen nicht möglich',
                    theme: 'dark',
                    position: 'bottomRight',
                    timeout: 5000
                });
            }
        })
    }
    join(id) {
        console.log("TODO JOIN", id);
        if (Lobby.checkCanJoin(id)) {
            SocketClass.emit("joinEvent", {
                roomID: id
            }, function(data) {
                console.log("data", data)
                if (data.success == true) {
                    iziToast.show({
                        title: '<strong>Lobby</strong>',
                        titleColor: 'rgb(232, 232, 232)',
                        titleSize: '16px',
                        message: 'beigetreten',
                        theme: 'dark',
                        position: 'bottomRight',
                        timeout: 5000
                    });
                } else {
                    iziToast.show({
                        title: '<strong>Fehler</strong>',
                        titleColor: 'rgb(232, 232, 232)',
                        titleSize: '16px',
                        message: 'Beitreten nicht möglich',
                        theme: 'dark',
                        position: 'bottomRight',
                        timeout: 5000
                    });
                }
            })
        }
    }
    isLobby(id) {
        let i = this.lobbies.findIndex(function(e) {
            return e.id == id;
        })
        return i > -1;
    }
    getOptions(id) {
        let i = this.lobbies.findIndex(function(e) {
            return e.id == id;
        })
        if (i > -1) {
            let options = [];
            let joined = this.lobbies[i].players.indexOf(Account.User)
            if (joined > -1) {
                if (this.lobbies[i].host != Account.User) {
                    options.push({
                        o: "leave",
                        text: "Verlassen"
                    })
                }
            } else {
                options.push({
                    o: "join",
                    text: "Beitreten"
                })
            }
            if ((this.lobbies[i].host == Account.User) || (Account.admin == 1)) {
                options.push({
                    o: "manage",
                    text: "Teilnehmer Entfernen"
                })
                options.push({
                    o: "keep",
                    text: "- Lobby neu erstellen"
                })
                options.push({
                    o: "edit",
                    text: "Aktion Bearbeiten"
                })
                options.push({
                    o: "success",
                    text: "Aktion Erfolgreich"
                })
                options.push({
                    o: "fail",
                    text: "Aktion Fehlgeschlagen"
                })
            }
            console.log(options)
            return options;
        }
    }
    checkCanJoin(id) {
        let i = this.lobbies.findIndex(function(e) {
            return e.id == id;
        })
        if (i > -1) {
            let joined = this.lobbies[i].players.indexOf(Account.User)
            if (joined == -1) {
                return true;
            }
        }
        return false;
    }
    action(id, type, state) {
        if (type == "keep") {
            this.remember = state;
        }
        if (type == "success") {
            SocketClass.emit("updateEvent", {
                roomID: id,
                action: type,
                remember: this.remember
            }, function(id) {
                if (id != false) {
                    console.log("callback", id);
                    $("#groups").html("");
                    groups.forEach(function(action) {
                        $("#groups").append('<div data-group="' + action.group + '" class="type"><img src="' + action.image + '"></img><span class="name">' + action.name + '</span></div>')
                    })
                    $("#groups").data("id", id);
                    $("#create_groups").show();
                    iziToast.show({
                        title: '<strong>Lobby</strong>',
                        titleColor: 'rgb(232, 232, 232)',
                        titleSize: '16px',
                        message: 'erstellt',
                        theme: 'dark',
                        position: 'bottomRight',
                        timeout: 5000
                    });
                }
            })
            this.resetContext()
        }
        if (type == "fail") {
            SocketClass.emit("updateEvent", {
                roomID: id,
                action: type,
                remember: this.remember
            }, function(id) {
                if (id != false) {
                    $("#groups").html("");
                    groups.forEach(function(action) {
                        $("#groups").append('<div data-group="' + action.group + '" class="type"><img src="' + action.image + '"></img><span class="name">' + action.name + '</span></div>')
                    })
                    $("#groups").data("id", id);
                    $("#create_groups").show();
                    iziToast.show({
                        title: '<strong>Lobby</strong>',
                        titleColor: 'rgb(232, 232, 232)',
                        titleSize: '16px',
                        message: 'erstellt',
                        theme: 'dark',
                        position: 'bottomRight',
                        timeout: 5000
                    });
                }
            })
            this.resetContext()
        }
        if (type == "join") {
            this.join(id);
        }
        if (type == "leave") {
            this.leave(id);
        }
    }
}
$(document).ready(function() {
    $("#signin").fadeIn();
    //
    $("#join_username").val(user_storage.get('username'))
    $("#join_password").val(user_storage.get('password'))
    $("#singin_button").on("click", function() {
        Account.login();
    })
    $(".lobby_group").hover(function() {
        let id = $(this).data("id")
        if (Lobby.checkCanJoin(id) && $(this).data("joined") == false) {
            let prompt = $($(this).find(".prompt_join"));
            if (prompt) {
                prompt.addClass("show");
            }
        }
    }, function() {
        console.log("Unhover");
        let prompt = $($(this).find(".prompt_join"));
        if (prompt) {
            prompt.removeClass("show");
        }
    })
    $('body').on('click', '.lobby_group', function() {
        console.log("g");
        let id = $(this).data("id")
        let joined = $(this).data("joined");
        if (Lobby.checkCanJoin(id) && joined == false) {
            console.log("join")
            let prompt = $($(this).find(".prompt_join"));
            if (prompt) {
                prompt.removeClass("show");
            }
            Lobby.join(id);
            $(this).data("joined", true);
            $(this).addClass("joined");
        }
    });
    $('body').on('click', function(e) {
        if ($(e.target).parents()[0] != $("#context")[0]) {
            $("#context").hide()
            $("#player_list_context").hide();
            $("#context").css({
                top: 0,
                left: 0,
                position: 'absolute'
            });
        } else {
            console.log("context click")
            console.log(e.target)
            if (($(e.target).data("action") == "keep")) {
                if (!$(e.target).hasClass("active")) {
                    $(e.target).addClass("active")
                } else {
                    $(e.target).removeClass("active")
                }
                Lobby.action($("#context").data("id"), $(e.target).data("action"), $(e.target).hasClass("active"));
            } else {
                if ($(e.target).data("action") == "edit") {
                    let id = $("#context").data("id");
                    let group = $("#context").data("group");
                    let actions = action_types.filter(function(action) {
                        return action.group == group;
                    })
                    console.log("viable changes", actions);
                    $("#types").html("");
                    actions.forEach(function(action) {
                        $("#types").append('<div data-type="' + action.type + '" class="type"><img src="' + action.image + '"></img><span class="name">' + action.name + '</span></div>')
                    })
                    $("#types").data("id", id);
                    $("#create_types").show();
                } else {
                    Lobby.action($("#context").data("id"), $(e.target).data("action"), true);
                }
                $("#context").hide()
            }
        }
        if ($(e.target).parents()[1] == $(".lobby_group.new")[0]) {
            console.log("New Lobby", hasLoaded)
            if (hasLoaded == true) {
                SocketClass.emit("createEvent", {}, function(id) {
                    if (id != false) {
                        console.log("callback", id);
                        $("#groups").html("");
                        groups.forEach(function(action) {
                            $("#groups").append('<div data-group="' + action.group + '" class="type"><img src="' + action.image + '"></img><span class="name">' + action.name + '</span></div>')
                        })
                        $("#groups").data("id", id);
                        $("#create_groups").show();
                        iziToast.show({
                            title: '<strong>Lobby</strong>',
                            titleColor: 'rgb(232, 232, 232)',
                            titleSize: '16px',
                            message: 'erstellt',
                            theme: 'dark',
                            position: 'bottomRight',
                            timeout: 5000
                        });
                    }
                })
            }
        }
    });
    $('body').on('contextmenu', '#create_types', function(e) {
        e.preventDefault()
    });
    $('#create_groups').on('click', '.types', function(e) {
        console.log("create groups", this);
        console.log("create groups", $($(e.target).parents(".type")[0]).data("group"));
        console.log("id", $("#groups").data("id"));
        let group = $($(e.target).parents(".type")[0]).data("group");
        let id = $("#groups").data("id");
        $("#create_groups").hide();
        if (group != undefined) {
            let actions = action_types.filter(function(action) {
                return action.group == group;
            })
            if (actions.length > 0) {
                $("#types").html("");
                actions.forEach(function(action) {
                    $("#types").append('<div data-desc="' + action.desc + '" data-type="' + action.type + '" class="type"><img src="' + action.image + '"></img><span class="name">' + action.name + '</span></div>')
                })
                $("#types").data("id", id);
                $("#types").data("group", group);
                $("#create_types").show();
            }
        } else {
            SocketClass.emit("updateEvent", {
                roomID: id,
                action: "fail",
                remember: false
            })
            iziToast.show({
                title: '<strong>Lobby</strong>',
                titleColor: 'rgb(232, 232, 232)',
                titleSize: '16px',
                message: 'entfernt',
                theme: 'dark',
                position: 'bottomRight',
                timeout: 5000
            });
        }
    });
    $('#create_types').on('click', '.types', function(e) {
        let f = $(e.target).parents(".type")[0];
        let id = $("#types").data("id");
        let group = $("#types").data("group");
        let actions = action_types.filter(function(action) {
            return action.group == group;
        })
        let type = $(f).data("type");
        if (type) {
            console.log("remove object");
            SocketClass.emit("editEvent", {
                roomID: id,
                type: type
            }, function() {
                let aName = action_types.filter(function(action) {
                    return action.type == type;
                })[0].name
                iziToast.show({
                    title: '<strong>Lobby</strong>',
                    titleColor: 'rgb(232, 232, 232)',
                    titleSize: '16px',
                    message: 'Geändert auf ' + aName,
                    theme: 'dark',
                    position: 'bottomRight',
                    timeout: 5000
                });
                $("#types").data("id", "false");
                $("#types").data("group", "false");
                $("#create_types").hide();
            })
        }
    });
    $('body').on('click', '#player_list_context', function(e) {
        console.log($(e.target).text());
        let name = $(e.target).text();
        let id = $("#context").data("id");
        SocketClass.emit("removeEventMember", {
            roomID: id,
            name: name
        }, function(data) {
            console.log("data", data);
            if (data.success == true) {
                iziToast.show({
                    title: '<strong>Lobby</strong>',
                    titleColor: 'rgb(232, 232, 232)',
                    titleSize: '16px',
                    message: 'Spieler ' + data.name + ' entfernt',
                    theme: 'dark',
                    position: 'bottomRight',
                    timeout: 5000
                });
            } else {
                iziToast.show({
                    title: '<strong>Lobby</strong>',
                    titleColor: 'rgb(232, 232, 232)',
                    titleSize: '16px',
                    message: 'Spieler konnte nicht entfernt werden',
                    theme: 'dark',
                    position: 'bottomRight',
                    timeout: 5000
                });
            }
        })
    });
    $(document).on('mouseenter', "#context > span[data-action='manage']", function(e) {
        let pos = $("#context").offset();
        $("#player_list_context").css({
            top: pos.top,
            left: $("#context").width() + pos.left,
            position: 'absolute'
        });
        let id = $("#context").data("id");
        $("#player_list_context").html("");
        if (Lobby.getMembers(id) != false) {
            Lobby.getMembers(id).forEach(function(member) {
                $("#player_list_context").append('<span>' + member + '</span>');
            })
        }
        $("#player_list_context").show();
    });
    $(document).on('mouseenter', "#context > span:not([data-action='manage'])", function(e) {
        $("#player_list_context").hide();
    });
    $(document).on('mouseleave ', "#context:not(#player_list_context)", function(e) {
        if (($("#player_list_context:hover").length > 0) == false) {
            $("#player_list_context").hide();
        }
    });
    $('body').on('contextmenu', '.lobby_group', function(e) {
        let id = $(this).data("id")
        let group = $(this).data("group");
        console.log("group", group);
        if (Lobby.isLobby(id)) {
            let options = Lobby.getOptions(id)
            $("#context").data("id", id);
            $("#context").data("group", group);
            $("#context").html("");
            options.forEach(function(en) {
                if (en.o == "keep") {
                    if (Lobby.remember == true) {
                        $("#context").append("<span class='active' data-action='" + en.o + "'>" + en.text + "</span>")
                    } else {
                        $("#context").append("<span data-action='" + en.o + "'>" + en.text + "</span>")
                    }
                } else {
                    if (en.o == "edit") {
                        $("#context").append("<span data-action='" + en.o + "'>" + en.text + "</span>")
                    } else {
                        $("#context").append("<span data-action='" + en.o + "'>" + en.text + "</span>")
                    }
                }
            })
            console.log(options);
            $("#context").show()
            $("#context").css({
                top: e.pageY,
                left: e.pageX,
                position: 'absolute'
            });
        }
    });
});
