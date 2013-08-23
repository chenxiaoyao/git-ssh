var sh = require('shelljs'),
    path = require('path'),
    fs = require('fs'),
    os = require('os'),
    home = process.env.USERPROFILE || process.env.HOME || process.env.HOMEPATH,
    root = path.join(home, '.ssh'),
    keyName = 'id_rsa';

function printError(msg) {
    console.log(msg);
    process.exit(1);
}

function initRoot() {
    if(!fs.existsSync(root)) {
        fs.mkdirSync(root);
    }
}

exports.create = function(email) {
    initRoot();
    sh.cd(root);
    var keyPath = path.join(root, keyName);
    if(fs.existsSync(keyPath)) {
        printError("The ssh key already exists! path: " + keyPath);
    }
    if(sh.which('ssh-keygen') === null) {
        printError("Please install Git command tool, and add bin folder to path envirionment! ");
    }
    if(email === null || email === undefined) {
        printError("Please input email parameter! ");
    }
    if(!email.match(/^[\w._-]+@[\w._-]+$/)) {
        printError("The email is illegale, pelease check it! ");
    }
    sh.exec('ssh-keygen -t rsa -C ' + email + ' -f ' + keyName, {silent:true});
    console.log("Success! The place of SSH key is " + root);
};

exports.import = function(key_path) {
    initRoot();
    if(!key_path) {
        printError("Please input the path of ssh key that you want to import! ");
    }
    key_path = path.resolve(key_path);
    if(!fs.existsSync(key_path)) {
        printError("The key: " + key_path + "is not existed! ");
    }
    var pubKey, privKey;
    if(path.extname(key_path) === '.pub') {
        pubKey = key_path;
        privKey = key_path.slice(0, -4);
        if(!fs.existsSync(privKey)) {
            printError("The key: " + privKey + "is not existed! ");
        }
    } else {
        pubKey = key_path + '.pub';
        privKey = key_path;
    }
    
    sh.cp('-f', privKey, root);
    if(fs.existsSync(pubKey)) {
        sh.cp('-f', pubKey, root);
    }
    if(!isWin()) {
        sh.exec('chmod 600 ' + path.join(root, keyName));
    }
    console.log('The SSH key is imported to folder: ' + root);
};

exports.where = function() {
    var keyPath = path.join(root, keyName);
    if(fs.existsSync(keyPath)) {
        console.log(keyPath);
        return keyPath;
    } else {
        console.log("The SSH key is not generated yet, please execute 'git-ssh create [email]' to generate key! ");
        return null;
    }
};

var SSH_AGENT_PID;
exports.init = function(finish) {
    var keyPath= exports.where(),
        authSockName = 'SSH_AUTH_SOCK',
        agentPidName = 'SSH_AGENT_PID';
    if(!keyPath) {
        process.exit(1);
    }
    if(sh.which('ssh-agent') === null) {
        printError("Please install Git command tool, and bin folder to path envirionment! ");
    }
    if(os.platform() === 'darwin' && sshAgentAlive()) {
        // In mac os, the default ssh agent is already started when system starts up
        addSshKey(finish);
    } else {
        var sshDataPath = path.join(root, 'ssh-data');
        if(fs.existsSync(sshDataPath)) {
            // initialize variable SSH_AGENT_PID and environment variable SSH_AUTH_SOCK
            eval(fs.readFileSync(sshDataPath, {encoding:'utf-8'}));
        }
        if(SSH_AGENT_PID && isSshAgentAlive(SSH_AGENT_PID)) {
            addSshKey(finish);
        } else {
            sh.exec('ssh-agent', function(code, output) {
                if(code !== 0) {
                    printError('Execute command "ssh-agent" error! ');
                }

                var matchData = output.match(/SSH_AUTH_SOCK=(.*?);.*\s*SSH_AGENT_PID=(.*?);.*/);
                if(!matchData) {
                    printError('The output of command "ssh-agent" is not correct! ');
                }
                var authSock = matchData[1], agentPid = matchData[2];
                process.env.SSH_AUTH_SOCK = authSock;
                fs.writeFileSync(sshDataPath, agentPidName + '=' + agentPid + ';process.env.SSH_AUTH_SOCK="' + authSock + '"');
                addSshKey(finish);
            });
        }
    }
};

exports.quit = function() {
    var sshDataPath = path.join(root, 'ssh-data');
    if(fs.existsSync(sshDataPath)) {
        eval(fs.readFileSync(sshDataPath, {encoding:'utf-8'}));
    }
    if(SSH_AGENT_PID && isSshAgentAlive(SSH_AGENT_PID)) {
        process.kill(SSH_AGENT_PID);
        SSH_AGENT_PID = undefined;
    }
};

function isSshAgentAlive(pid) {
    if(isWin()) {
        var tasks = sh.exec('tasklist', {silent: true}).output;
        var re = new RegExp('ssh-agent.exe\\s*' + pid);
        return !!tasks.match(re);
    } else {
        try {
            var result = process.kill(pid, 0);
            
            return result;
        }
        catch (e) {
            return e.code === 'EPERM';
        }
    }
}

function addSshKey(finish) {
    var keyPath= exports.where(), ret;
    if(isWin()) {
        ret = sh.exec('ssh-add ' + keyPath + ' & ssh-add -l');
    } else {
        ret = sh.exec('ssh-add ' + keyPath);
        if(ret.code === 0) ret = sh.exec('ssh-add -l');
    }
    if(ret.code === 0) {
        console.log("Success! You can use git command to operate ssh repository now! ");
        if(finish) {
            finish();
        }
    } else {
        console.log("Error! " +  ret.output);
    }
}

function sshAgentAlive() {
    var ps = sh.exec('ps -A', {silent: true}).output;
    return ps.indexOf('ssh-agent') !== -1;
}

function isWin() {
    return os.platform().indexOf('win') === 0;
}