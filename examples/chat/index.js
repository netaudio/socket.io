// Setup basic express server
var express = require('express');
const bodyParser = require('body-parser');
const errorhandler = require('errorhandler');
const morgan = require('morgan');
const logger = require('log4js');
var app = express();
const fs = require('fs');
var path = require('path');
const N = require('./nuve');

const options = {
    key: fs.readFileSync('/root/opensource/licode/cert/key.pem').toString(),
    cert: fs.readFileSync('/root/opensource/licode/cert/cert.pem').toString(),
};

var server = require('https').createServer(options, app);
var io = require('socket.io')(server);
var port = process.env.PORT || 5000;

const logFile = './log4js_configuration.json';

logger.configure(logFile);
const log = logger.getLogger('BasicExample');

server.listen(port, () => { log.info('Server listening at port %d', port); });

// Routing
app.use(errorhandler({
    dumpExceptions: true,
    showStack: true,
}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true,
}));
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

N.API.init("5eff18b325860246811f07c8", "10440", "http://192.168.101.76:3000/");
let defaultRoom;
const defaultRoomName = 'basicExampleRoom';

// Chatroom
app.get('/getRooms/', (req, res) => {
    log.info("getRooms!!");
    N.API.getRooms((rooms) => { res.send(rooms); });
});

const getOrCreateRoom = (name, type = 'erizo', mediaConfiguration = 'default', callback = () => { }) => {
    if (name === defaultRoomName && defaultRoom) {
        callback(defaultRoom);
        return;
    }

    N.API.getRooms((roomlist) => {
        log.info("roomlist:%s", roomlist);
        let theRoom = '';
        const rooms = JSON.parse(roomlist);

        for (let i = 0; i < rooms.length; i += 1) {
            const room = rooms[i];
            if (room.name === name && room.data && room.data.basicExampleRoom) {
                theRoom = room._id;
                callback(theRoom);
                return;
            }
        }
        const extra = { data: { basicExampleRoom: true }, mediaConfiguration };
        if (type === 'p2p')
            extra.p2p = true;

        N.API.createRoom(name, (roomID) => {
            theRoom = roomID._id;
            callback(theRoom);
        }, () => { }, extra);
    });
};

app.post('/createToken/', (req, res) => {
    log.info('Creating token. Request body: ', req.body);

    const username = req.body.username;
    const role = req.body.role;

    let room = defaultRoomName;
    let type;
    let roomId;
    let mediaConfiguration;

    if (req.body.room)
        room = req.body.room;
    if (req.body.type)
        type = req.body.type;
    if (req.body.roomId)
        roomId = req.body.roomId;
    if (req.body.mediaConfiguration)
        mediaConfiguration = req.body.mediaConfiguration;
    log.info("before request token");
    const createToken = (tokenRoomId) => {
        log.info("tokenRoomId:%s", tokenRoomId);
        N.API.createToken(tokenRoomId, username, role,
            (token) => {
                log.info('Token created', token);
                res.send(token);
            },
            (error) => {
                log.info('Error creating token', error);
                res.status(401).send('No Erizo Controller found');
            });
    };
    if (roomId) {
        createToken(roomId);
    } else {
        getOrCreateRoom(room, type, mediaConfiguration, createToken);
    }
    log.info("after request token");
});

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, DELETE');
    res.header('Access-Control-Allow-Headers', 'origin, content-type');
    if (req.method === 'OPTIONS') {
        res.send(200);
    } else {
        next();
    }
});

var numUsers = 0;

io.on('connection', (socket) => {
    var addedUser = false;

    // when the client emits 'new message', this listens and executes
    socket.on('new message', (data) => {
        // we tell the client to execute 'new message'
        socket.broadcast.emit('new message', { username: socket.username, message: data });
    });

    // when the client emits 'add user', this listens and executes
    socket.on('add user', (username) => {
        if (addedUser)
            return;

        // we store the username in the socket session for this client
        socket.username = username;
        ++numUsers;
        addedUser = true;
        socket.emit('login', { numUsers: numUsers });
        // echo globally (all clients) that a person has connected
        socket.broadcast.emit('user joined', { username: socket.username, numUsers: numUsers });
    });

    // when the client emits 'typing', we broadcast it to others
    socket.on('typing', () => { socket.broadcast.emit('typing', { username: socket.username }); });

    // when the client emits 'stop typing', we broadcast it to others
    socket.on('stop typing', () => { socket.broadcast.emit('stop typing', { username: socket.username }); });

    // when the user disconnects.. perform this
    socket.on('disconnect', () => {
        if (addedUser) {
            --numUsers;

            // echo globally that this client has left
            socket.broadcast.emit('user left', { username: socket.username, numUsers: numUsers });
        }
    });
});
