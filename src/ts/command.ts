import FileSystem from "./filesystem";

abstract class Command {
    abstract run(args: string[], fileSystem: FileSystem): string;
}

export default Command;