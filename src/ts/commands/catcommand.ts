import Command from "../command";
import Directory from "../directory";
import FileSystem from "../filesystem";

class CatCommand extends Command {
    run = (args: string[], fileSystem: FileSystem): string => {
        let output = '';
        const file = fileSystem.currentDirectory.getFile(args[0]);
        if(file instanceof Directory) {
            return 'cat: ' + args[0] + ': Is a directory';
        }
        if (file) {
            output = file.read();
        } else {
            output = 'file not found';
        }
        return output;
    }
}

export default CatCommand; 