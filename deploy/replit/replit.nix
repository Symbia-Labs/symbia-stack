{ pkgs }: {
  deps = [
    pkgs.nodejs_22
    pkgs.nodePackages.typescript-language-server
    pkgs.postgresql
    pkgs.redis
  ];

  env = {
    LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [
      pkgs.stdenv.cc.cc.lib
    ];
  };
}
