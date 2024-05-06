import Command from "./command";
import CommandRegistry from "./commandregistry";
import CatCommand from "./commands/catcommand";
import CdCommand from "./commands/cdcommand";
import EchoCommand from "./commands/echocommand";
import LsCommand from "./commands/lscommand";
import MkdirCommand from "./commands/mkdircommand";
import PwdCommand from "./commands/pwdcommand";
import TouchCommand from "./commands/touchcommand";
import FileSystem from "./filesystem";

class CommandConfig {
    private registry: CommandRegistry;
    constructor(fs: FileSystem) {
        this.registry = new CommandRegistry();
        this.registry.registerCommand('ls', new LsCommand());
        this.registry.registerCommand('pwd', new PwdCommand());
        this.registry.registerCommand('mkdir', new MkdirCommand());
        this.registry.registerCommand('touch', new TouchCommand());
        this.registry.registerCommand('cat', new CatCommand());
        this.registry.registerCommand('echo', new EchoCommand());
        this.registry.registerCommand('cd', new CdCommand(fs));
    }
    getCommands = () => { return this.registry }
}

export default CommandConfig;