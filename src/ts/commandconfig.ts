import CommandRegistry from "./commandregistry";
import CatCommand from "./commands/catcommand";
import CdCommand from "./commands/cdcommand";
import ClearCommand from "./commands/clearcommand";
import CpCommand from "./commands/cpcommand";
import EchoCommand from "./commands/echocommand";
import EnvCommand from "./commands/envcommand";
import ExitCodeCommand from "./commands/exitcodecommand";
import ExportCommand from "./commands/exportcommand";
import GrepCommand from "./commands/grepcommand";
import HeadCommand from "./commands/headcommand";
import HelpCommand from "./commands/helpcommand";
import HistoryCommand from "./commands/historycommand";
import LsCommand from "./commands/lscommand";
import MkdirCommand from "./commands/mkdircommand";
import MvCommand from "./commands/mvcommand";
import PrintCommand from "./commands/printcommand";
import PwdCommand from "./commands/pwdcommand";
import ResetCommand from "./commands/resetcommand";
import RmCommand from "./commands/rmcommand";
import RmdirCommand from "./commands/rmdircommand";
import SortCommand from "./commands/sortcommand";
import TeeCommand from "./commands/teecommand";
import TouchCommand from "./commands/touchcommand";
import TreeCommand from "./commands/treecommand";
import UniqCommand from "./commands/uniqcommand";
import UnsetCommand from "./commands/unsetcommand";
import WcCommand from "./commands/wccommand";
import WhichCommand from "./commands/whichcommand";

class CommandConfig {
    private registry: CommandRegistry;
    constructor() {
        this.registry = new CommandRegistry();
        this.registry.registerCommand('ls', new LsCommand());
        this.registry.registerCommand('pwd', new PwdCommand());
        this.registry.registerCommand('cd', new CdCommand());
        this.registry.registerCommand('mkdir', new MkdirCommand());
        this.registry.registerCommand('rmdir', new RmdirCommand());
        this.registry.registerCommand('touch', new TouchCommand());
        this.registry.registerCommand('cat', new CatCommand());
        this.registry.registerCommand('echo', new EchoCommand());
        this.registry.registerCommand('rm', new RmCommand());
        this.registry.registerCommand('mv', new MvCommand());
        this.registry.registerCommand('cp', new CpCommand());
        this.registry.registerCommand('tree', new TreeCommand());
        this.registry.registerCommand('grep', new GrepCommand());
        this.registry.registerCommand('wc', new WcCommand());
        this.registry.registerCommand('head', new HeadCommand());
        this.registry.registerCommand('tail', new HeadCommand(true));
        this.registry.registerCommand('sort', new SortCommand());
        this.registry.registerCommand('uniq', new UniqCommand());
        this.registry.registerCommand('tee', new TeeCommand());
        this.registry.registerCommand('help', new HelpCommand());
        this.registry.registerCommand('clear', new ClearCommand());
        this.registry.registerCommand('reset', new ResetCommand());
        this.registry.registerCommand('history', new HistoryCommand());
        this.registry.registerCommand('export', new ExportCommand());
        this.registry.registerCommand('unset', new UnsetCommand());
        this.registry.registerCommand('env', new EnvCommand());
        this.registry.registerCommand('which', new WhichCommand());
        this.registry.registerCommand('true', new ExitCodeCommand(0));
        this.registry.registerCommand('false', new ExitCodeCommand(1));
        this.registry.registerCommand('whoami', new PrintCommand('print the current user', ctx => ctx.shell.variable('USER')));
        this.registry.registerCommand('hostname', new PrintCommand('print the machine name', ctx => ctx.shell.variable('HOSTNAME')));
        this.registry.registerCommand('uname', new PrintCommand('print system information', () => 'pseudo-os'));
        this.registry.registerCommand('date', new PrintCommand('print the date and time', () => new Date().toString()));
    }
    getCommands = () => { return this.registry }
}

export default CommandConfig;
