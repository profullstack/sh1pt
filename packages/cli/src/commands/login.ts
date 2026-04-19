import { Command } from 'commander';
import kleur from 'kleur';

export const loginCmd = new Command('login')
  .description('Authenticate with sh1pt cloud (device-code flow)')
  .action(() => {
    console.log(kleur.dim('[stub] open browser → device code flow → write token to ~/.sh1pt/credentials'));
  });
