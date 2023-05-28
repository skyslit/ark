import os from 'os';
import { Observable } from 'rxjs';
// import * as pty from 'node-pty';
import { spawn } from 'child_process';

const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

const normalizeOptions = (input: any) => {
  let result = {
    disableAutoReturn: false,
    disableAutoReplace: false,
  };

  result = Object.assign(result, input);

  return result;
};

export const createCommand = (
  cmd: string,
  cmdBash: string = undefined,
  opts: any = undefined
) => {
  opts = normalizeOptions(opts);
  const hasBashSpecificCommand = cmdBash !== undefined || cmdBash !== null;

  if (hasBashSpecificCommand === true) {
    const shellName = shell;
    if (shellName === 'bash') {
      cmd = cmdBash;
    }
  } else {
    if (opts.disableAutoReplace === false) {
      cmd = cmdBash.replace(';', ' && ');
    }
  }

  if (opts.disableAutoReturn === false) {
    if (cmd.endsWith('\n') === false) {
      cmd = cmd + '\n';
    }
  }

  return cmd;
};

// /**
//  * Runs a command on terminal
//  * @param {string} label
//  * @param {string} commandStr
//  * @param {any} opts
//  * @return {Observable}
//  */
// export default function runCommand(
//   label: string,
//   commandStr: string,
//   opts?: any
// ) {
//   return new Observable((observer) => {
//     observer.next(label);

//     setTimeout(() => {
//       const ptyProcess = pty.spawn(
//         shell,
//         [],
//         Object.assign(
//           {
//             name: 'xterm-color',
//             cols: 80,
//             rows: 30,
//             cwd: process.cwd(),
//             env: process.env,
//           },
//           opts || {}
//         )
//       );

//       ptyProcess.on('data', function (chunk: any) {
//         if (chunk) {
//           observer.next(chunk.toString());
//         }
//       });

//       ptyProcess.onExit((e: any) => {
//         observer.complete();
//       });

//       ptyProcess.write(createCommand(commandStr, commandStr));
//     }, 3000);
//   });
// }

/**
 * Runs a command on terminal
 * @param {string} label
 * @param {string} commandStr
 * @param {any} opts
 * @return {Observable}
 */
export default function runCommand(
  label: string,
  commandStr: string,
  opts?: any
) {
  return new Observable((observer) => {
    observer.next(label);

    const bash = spawn(shell, {
      cwd: opts.cwd,
    });

    bash.stdout.on('data', function (data) {
      observer.next(data.toString());
    });

    bash.stderr.on('data', function (data) {
      observer.next(data.toString());
    });

    bash.on('exit', function (code) {
      observer.complete();
    });

    bash.stdin.write(createCommand(commandStr, commandStr));
  });
}
