# lilacme2json

This directory contains the `lilacme2json.c` utility program.  This program must be built with [libshastina](http://www.purl.org/canidtech/r/shastina) beta 0.9.2 or compatible, as well as with the `lilac_mesh` module.

If you are in the `util/lilacme2json` directory of this project, you can build the utility with the following invocation (all on one line):

    gcc -O2 -o lilacme2json
      -I../lilac_mesh
      -I/path/to/shastina/include
      -L/path/to/shastina/lib
      lilacme2json.c
      ../lilac_mesh/lilac_mesh.c
      -lshastina

This utility program reads a Shastina-format Lilac mesh file and outputs a JSON representation of the file in a format compatible with the Lilac mesh editor client.
