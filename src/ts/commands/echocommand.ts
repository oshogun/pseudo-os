import Command from "../command";

class EchoCommand extends Command {
    run = (args: string[]): string => {
        return args.join(' ');
    }
}

export default EchoCommand;