$(function () {
    var FADE_TIME = 150;           // ms
    var TYPING_TIMER_LENGTH = 400; // ms
    var COLORS = ['#e21400', '#91580f', '#f8a700', '#f78b00', '#58dc00', '#287b00', '#a8f07a', '#4ae8c4', '#3b88eb', '#3824aa', '#a700ff', '#d300e7'];

    // Initialize variables
    var $window = $(window);
    var $usernameInput = $('.usernameInput'); // Input for username
    var $messages = $('.messages');           // Messages area
    var $inputMessage = $('.inputMessage');   // Input message input box

    var $loginPage = $('.login.page'); // The login page
    var $chatPage = $('.chat.page');   // The chatroom page

    // Prompt for setting a username
    var username;
    var connected = false;
    var typing = false;
    var lastTypingTime;
    var $currentInput = $usernameInput.focus();

    var socket = io();

    let localStream;
    let slideShowMode = false;
    const configFlags = {
        noStart: false, // disable start button when only subscribe
        forceStart: false, // force start button in all cases
        screen: false, // screensharinug
        room: 'basicExampleRoom', // room name
        singlePC: false,
        type: 'erizo', // room type
        onlyAudio: false,
        mediaConfiguration: 'default',
        onlySubscribe: false,
        onlyPublish: false,
        autoSubscribe: false,
        offerFromErizo: false,
        simulcast: false,
    };

    const addParticipantsMessage =
        (data) => {
            var message = '';
            if (data.numUsers === 1) {
                message += "there's 1 participant";
            } else {
                message += "there are " + data.numUsers + " participants";
            }
            log(message);
        }

    // Sets the client's username
    const setUsername = () => {
        username = cleanInput($usernameInput.val().trim());

        // If the username is valid
        if (username) {
            $loginPage.fadeOut();
            $chatPage.show();
            $loginPage.off('click');
            $currentInput = $inputMessage.focus();


            // Tell the server your username
            socket.emit('add user', username);

            const roomData = { username: `user ${parseInt(Math.random() * 100, 10)}`, role: 'presenter', room: 'basicExampleRoom', type: 'erizo', mediaConfiguration: 'default' };

            createToken(roomData, (response) => {
                console.log("createToken response:");
                console.log(response);

                const config = {
                    audio: true,
                    video: true,
                    data: true,
                    screen: false,
                    local: true,
                    streamID: "adgasfasd",
                    attributes: {}
                };

                Erizo.Logger.setLogLevel(Erizo.Logger.INFO);

                localStream = Erizo.Stream(config);
                window.localStream = localStream;

                const subscribeToStreams = (streams) => {
                    console.log("subscribeToStreams called,streams size:", streams.length);
                    if (configFlags.autoSubscribe) {
                        return;
                    }
                    if (configFlags.onlyPublish) {
                        return;
                    }
                    const cb = (evt) => {
                        console.log('Bandwidth Alert', evt.msg, evt.bandwidth);
                    };

                    streams.forEach((stream) => {
                        if (localStream.getID() !== stream.getID()) {
                            room.subscribe(stream, { slideShowMode, metadata: { type: 'subscriber' }, offerFromErizo: configFlags.offerFromErizo });
                            stream.addEventListener('bandwidth', cb);
                        }
                    });
                };

                const token = response;
                room = Erizo.Room({ token });
                console.log("room info:", JSON.stringify(room));

                window.room = room;
                room.addEventListener("room-connected", (roomEvent) => {
                    console.log("receive event: room-connected");
                    const options = { metadata: { type: 'publisher' } };
                    if (configFlags.simulcast) options.simulcast = { numSpatialLayers: 2 };

                    console.log("the streams of room-connected:", roomEvent.streams);
                    subscribeToStreams(roomEvent.streams);

                    if (!configFlags.onlySubscribe) {
                        room.publish(localStream, options);
                    }
                    room.addEventListener('quality-level', (qualityEvt) => {
                        console.log(`New Quality Event, connection quality: ${qualityEvt.message}`);
                    });
                    if (configFlags.autoSubscribe) {
                        room.autoSubscribe({ '/attributes/type': 'publisher' }, {}, { audio: true, video: true, data: false }, () => { });
                    }
                });
                room.addEventListener("room-empty", (roomEvent) => {
                    console.log("receive event: room-empty");

                });
                room.addEventListener("stream-subscribed", (streamEvent) => {
                    console.log("receive event: stream-subscribed");
                    const stream = streamEvent.stream;
                    const div = document.createElement('div');
                    div.setAttribute('style', 'width: 320px; height: 240px;float:left;');
                    div.setAttribute('id', `test${stream.getID()}`);
                    document.getElementById('peerVideoWin').appendChild(div);
                    stream.show(`test${stream.getID()}`);
                });
                room.addEventListener("stream-added", (streamEvent) => {
                    console.log("receive event: stream-added");
                    const streams = [];
                    streams.push(streamEvent.stream);
                    if (localStream) {
                        localStream.setAttributes({ type: 'publisher' });
                    }
                    subscribeToStreams(streams);

                });
                room.addEventListener("stream-removed", (streamEvent) => {
                    console.log("receive event: stream-removed");
                    const stream = streamEvent.stream;
                    if (stream.elementID !== undefined) {
                        const element = document.getElementById(stream.elementID);
                        document.getElementById('peerVideoWin').removeChild(element);
                    }
                });
                room.addEventListener("stream-failed", (roomEvent) => {
                    console.log("receive event: stream-failed");
                });

                const div = document.createElement('div');
                div.setAttribute('style', 'width:320px; height: 240px; float: left');
                div.setAttribute('id', 'myVideo');
                document.getElementById('localVideoWin').appendChild(div);

                localStream.addEventListener('access-accepted', () => {
                    console.log("localstream id:", localStream.getID());
                    room.connect({ singlePC: false });
                    localStream.show("myVideo");
                });
                localStream.init();
            });
        }
    }

    // Sends a chat message
    const sendMessage =
        () => {
            var message = $inputMessage.val();
            // Prevent markup from being injected into the message
            message = cleanInput(message);
            // if there is a non-empty message and a socket connection
            if (message && connected) {
                $inputMessage.val('');
                addChatMessage({ username: username, message: message });
                // tell server to execute 'new message' and send along one parameter
                socket.emit('new message', message);
            }
        }

    // Log a message
    const log =
        (message, options) => {
            var $el = $('<li>').addClass('log').text(message);
            addMessageElement($el, options);
        }

    // Adds the visual chat message to the message list
    const addChatMessage =
        (data, options) => {
            // Don't fade the message in if there is an 'X was typing'
            var $typingMessages = getTypingMessages(data);
            options = options || {};
            if ($typingMessages.length !== 0) {
                options.fade = false;
                $typingMessages.remove();
            }

            var $usernameDiv = $('<span class="username"/>').text(data.username).css('color', getUsernameColor(data.username));
            var $messageBodyDiv = $('<span class="messageBody">').text(data.message);

            var typingClass = data.typing ? 'typing' : '';
            var $messageDiv = $('<li class="message"/>').data('username', data.username).addClass(typingClass).append($usernameDiv, $messageBodyDiv);

            addMessageElement($messageDiv, options);
        }

    // Adds the visual chat typing message
    const addChatTyping =
        (data) => {
            data.typing = true;
            data.message = 'is typing';
            addChatMessage(data);
        }

    // Removes the visual chat typing message
    const removeChatTyping = (data) => { getTypingMessages(data).fadeOut(function () { $(this).remove(); }); }

    // Adds a message element to the messages and scrolls to the bottom
    // el - The element to add as a message
    // options.fade - If the element should fade-in (default = true)
    // options.prepend - If the element should prepend
    //   all other messages (default = false)
    const addMessageElement =
        (el, options) => {
            var $el = $(el);

            // Setup default options
            if (!options) {
                options = {};
            }
            if (typeof options.fade === 'undefined') {
                options.fade = true;
            }
            if (typeof options.prepend === 'undefined') {
                options.prepend = false;
            }

            // Apply options
            if (options.fade) {
                $el.hide().fadeIn(FADE_TIME);
            }
            if (options.prepend) {
                $messages.prepend($el);
            } else {
                $messages.append($el);
            }
            $messages[0].scrollTop = $messages[0].scrollHeight;
        }

    // Prevents input from having injected markup
    const cleanInput = (input) => { return $('<div/>').text(input).html(); }

    // Updates the typing event
    const updateTyping =
        () => {
            if (connected) {
                if (!typing) {
                    typing = true;
                    socket.emit('typing');
                }
                lastTypingTime = (new Date()).getTime();

                setTimeout(() => {
                    var typingTimer = (new Date()).getTime();
                    var timeDiff = typingTimer - lastTypingTime;
                    if (timeDiff >= TYPING_TIMER_LENGTH && typing) {
                        socket.emit('stop typing');
                        typing = false;
                    }
                }, TYPING_TIMER_LENGTH);
            }
        }

    // Gets the 'X is typing' messages of a user
    const getTypingMessages = (data) => { return $('.typing.message').filter(function (i) { return $(this).data('username') === data.username; }); }

    // Gets the color of a username through our hash function
    const getUsernameColor =
        (username) => {
            // Compute hash code
            var hash = 7;
            for (var i = 0; i < username.length; i++) {
                hash = username.charCodeAt(i) + (hash << 5) - hash;
            }
            // Calculate color
            var index = Math.abs(hash % COLORS.length);
            return COLORS[index];
        }
    // Keyboard events
    $window.keydown(event => {
        // Auto-focus the current input when a key is typed
        if (!(event.ctrlKey || event.metaKey || event.altKey)) {
            $currentInput.focus();
        }
        // When the client hits ENTER on their keyboard
        if (event.which === 13) {
            if (username) {
                sendMessage();
                socket.emit('stop typing');
                typing = false;
            } else {
                setUsername();
            }
        }
    });

    $inputMessage.on('input', () => { updateTyping(); });

    // Click events

    // Focus input when clicking anywhere on login page
    $loginPage.click(() => { $currentInput.focus(); });

    // Focus input when clicking on the message input's border
    $inputMessage.click(() => { $inputMessage.focus(); });

    // Socket events

    // Whenever the server emits 'login', log the login message
    socket.on('login', (data) => {
        connected = true;
        // Display the welcome message
        var message = "Welcome to Socket.IO Chat – ";
        log(message, { prepend: true });
        addParticipantsMessage(data);
    });

    // Whenever the server emits 'new message', update the chat body
    socket.on('new message', (data) => { addChatMessage(data); });

    // Whenever the server emits 'user joined', log it in the chat body
    socket.on('user joined', (data) => {
        log(data.username + ' joined');
        addParticipantsMessage(data);
    });

    // Whenever the server emits 'user left', log it in the chat body
    socket.on('user left', (data) => {
        log(data.username + ' left');
        addParticipantsMessage(data);
        removeChatTyping(data);
    });

    // Whenever the server emits 'typing', show the typing message
    socket.on('typing', (data) => { addChatTyping(data); });

    // Whenever the server emits 'stop typing', kill the typing message
    socket.on('stop typing', (data) => { removeChatTyping(data); });

    socket.on('disconnect', () => { log('you have been disconnected'); });

    socket.on('reconnect', () => {
        log('you have been reconnected');
        if (username) {
            socket.emit('add user', username);
        }
    });

    socket.on('reconnect_error', () => { log('attempt to reconnect has failed'); });
});

const createToken = (roomData, callback) => {
    const req = new XMLHttpRequest();
    // const url = `http://192.168.101.76:3000/createToken/`;
    const url = `/createToken/`;

    req.onreadystatechange = () => {
        console.log("createtoken response %d", req.readyState);
        if (req.readyState === 4) {
            callback(req.responseText);
        }
    };

    req.open('POST', url, true);
    req.setRequestHeader('Content-Type', 'application/json');
    req.send(JSON.stringify(roomData));
};

window.onload = () => {
    console.log("page loaded");


};
