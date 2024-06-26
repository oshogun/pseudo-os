import Command from "../command";
import FileSystem from "../filesystem";

class PwdCommand extends Command {
    run = (args: string[], fileSystem: FileSystem): string => {
        return fileSystem.currentDirectory.path;
    }
}

export default PwdCommand;