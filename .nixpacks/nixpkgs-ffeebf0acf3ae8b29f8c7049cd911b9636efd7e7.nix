{ }:

let pkgs = import (fetchTarball "https://github.com/NixOS/nixpkgs/archive/ffeebf0acf3ae8b29f8c7049cd911b9636efd7e7.tar.gz") { overlays = [ (import (builtins.fetchTarball "https://github.com/railwayapp/nix-npm-overlay/archive/main.tar.gz")) ]; };
in with pkgs;
  let
    APPEND_LIBRARY_PATH = "${lib.makeLibraryPath [ gcc-unwrapped ] }";
    myLibraries = writeText "libraries" ''
      export LD_LIBRARY_PATH="${APPEND_LIBRARY_PATH}:$LD_LIBRARY_PATH"
      
    '';
  in
    buildEnv {
      name = "ffeebf0acf3ae8b29f8c7049cd911b9636efd7e7-env";
      paths = [
        (runCommand "ffeebf0acf3ae8b29f8c7049cd911b9636efd7e7-env" { } ''
          mkdir -p $out/etc/profile.d
          cp ${myLibraries} $out/etc/profile.d/ffeebf0acf3ae8b29f8c7049cd911b9636efd7e7-env.sh
        '')
        nodejs_18 pnpm-9_x
      ];
    }
