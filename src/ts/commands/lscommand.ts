import Command from '../command';
import FileSystem from '../filesystem';

class LsCommand extends Command {
    run = (args: string[], fileSystem: FileSystem): string => {
        let output = '';
        output = fileSystem.currentDirectory.read();
        return output;
    }
}

export default LsCommand;