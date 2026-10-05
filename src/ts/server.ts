import express from 'express';
import path from 'path';

import Shell from './shell/shell';
import { createShell } from './system';

// Each client gets its own shell, keyed by the `session` field of the request.
// Requests without one share the "default" session. Sessions live in memory
// only and are lost when the server restarts.
const sessions = new Map<string, Shell>();

function getShell(session: string): Shell {
    let shell = sessions.get(session);
    if (!shell) {
        shell = createShell();
        sessions.set(session, shell);
    }
    return shell;
}

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Runs a command. Responds with the plain-text output by default, or with
// { output, exitCode, cwd, prompt } as JSON when the client accepts JSON.
app.post('/execute', (req: express.Request, res: express.Response) => {
    const { command, session } = req.body ?? {};
    if (typeof command !== 'string') {
        res.status(400).send('expected a JSON body with a "command" string\n');
        return;
    }
    const shell = getShell(typeof session === 'string' && session ? session : 'default');
    console.log('executing command: ' + command);
    const result = shell.execute(command);
    res.set('X-Exit-Code', String(result.exitCode));
    if (req.accepts(['text/plain', 'application/json']) === 'application/json') {
        res.json({ output: result.output, exitCode: result.exitCode, cwd: shell.fs.cwd, prompt: shell.prompt });
    } else {
        res.type('text/plain').send(result.output);
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
