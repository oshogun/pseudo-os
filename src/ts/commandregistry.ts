import Command from "./command";

class CommandRegistry {
    commands: Map<string, Command>;

    constructor() {
        this.commands = new Map();
    }

    registerCommand(name: string, command: Command): void {
        this.commands.set(name, command);
    }

    getCommand(name: string): Command | undefined {
        return this.commands.get(name);
    }

    names(): string[] {
        return [...this.commands.keys()].sort();
    }
}

export default CommandRegistry;
