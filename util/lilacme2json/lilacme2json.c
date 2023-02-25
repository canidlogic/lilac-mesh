/*
 * lilacme2json.c
 * ==============
 * 
 * Utility program that reads a Lilac mesh in the standard Shastina
 * format and outputs a JSON representation.
 * 
 * Syntax
 * ------
 * 
 *   lilacme2json [input]
 * 
 * [input] is the path to the Lilac mesh Shastina file to interpret.
 * 
 * The JSON conversion is written to standard output.  This JSON
 * representation is used by the Lilac mesh editor.  See the Lilac mesh
 * editor for documentation of the JSON format.
 * 
 * Compilation
 * -----------
 * 
 * Build this program together with the lilac_mesh.c module of Lilac and
 * Shastina.
 */

#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

#include "lilac_mesh.h"
#include "shastina.h"

/*
 * Local data
 * ----------
 */

/*
 * The name of this executable module.
 * 
 * This is set at the start of the program entrypoint.  It should be
 * included in error reports from the program.
 */
static const char *pModule = NULL;

/*
 * Local functions
 * ---------------
 */

/* Prototypes */
static void meshToJSON(const LILAC_MESH *pMesh);

/*
 * Given a Lilac mesh object, print out a JSON representation to
 * standard output.
 * 
 * Parameters:
 * 
 *   pMesh - the mesh object
 */
static void meshToJSON(const LILAC_MESH *pMesh) {
  
  int32_t i = 0;
  const LILAC_MESH_POINT *pp = NULL;
  const uint16_t *pt = NULL;
  
  /* Check parameter */
  if (pMesh == NULL) {
    abort();
  }
  
  /* Print start of JSON object and points array */
  printf("{\n  \"points\": [");
  
  /* Print each point */
  for(i = 0; i < pMesh->point_count; i++) {
    /* Get reference to current point object */
    pp = &((pMesh->pPoints)[i]);
    
    /* If not the first point, print a comma */
    if (i > 0) {
      printf(",");
    }
    
    /* Print line break from previous line and indent */
    printf("\n    ");
    
    /* Print point parameters */
    printf("{\"uid\": \"%lx\", \"nrm\": \"%d,%d\", \"loc\": \"%d,%d\"}",
              (long) (i + 1),
              (int) (pp->normd),
              (int) (pp->norma),
              (int) (pp->x),
              (int) (pp->y));
  }
  
  /* Finish points array and begin triangle array */
  printf("\n  ],\n  \"tris\": [");
  
  /* Print each triangle */
  for(i = 0; i < pMesh->tri_count; i++) {
    /* Get reference to first vertex of current triangle */
    pt = &((pMesh->pTris)[i * 3]);
    
    /* If not the first triangle, print a comma */
    if (i > 0) {
      printf(",");
    }
    
    /* Print line break from previous line and indent */
    printf("\n    ");
    
    /* Print triangle array */
    printf("[\"%lx\", \"%lx\", \"%lx\"]",
              ((long) pt[0]) + 1,
              ((long) pt[1]) + 1,
              ((long) pt[2]) + 1);
  }
  
  /* Finish triangle array and JSON object */
  printf("\n  ]\n}\n");
}

/*
 * Program entrypoint
 * ------------------
 */

int main(int argc, char *argv[]) {
  
  int status = 1;
  int x = 0;
  int errcode = 0;
  long line_num = 0;
  const char *pPath = NULL;
  
  FILE *pIn = NULL;
  SNSOURCE *pSrc = NULL;
  LILAC_MESH *pMesh = NULL;
  
  /* Get module name */
  pModule = NULL;
  if ((argc > 0) && (argv != NULL)) {
    pModule = argv[0];
  }
  if (pModule == NULL) {
    pModule = "lilacme2json";
  }
  
  /* Check argv */
  if (argc > 0) {
    if (argv == NULL) {
      abort();
    }
    for(x = 0; x < argc; x++) {
      if (argv[x] == NULL) {
        abort();
      }
    }
  }
  
  /* Check number of parameters */
  if (argc != 2) {
    status = 0;
    fprintf(stderr, "%s: Wrong number of arguments!\n", pModule);
  }
  
  /* Get the program arguments */
  if (status) {
    pPath = argv[1];
  }
  
  /* Open the input file as a Shastina source and assign ownership of
   * the file handle to the Shastina source object */
  if (status) {
    pIn = fopen(pPath, "rb");
    if (pIn != NULL) {
      pSrc = snsource_file(pIn, 1);
      pIn = NULL;
      
    } else {
      status = 0;
      fprintf(stderr, "%s: Can't open input file!\n", pModule);
    }
  }

  /* Parse the input file and build the mesh representation */
  if (status) {
    pMesh = lilac_mesh_new(pSrc, &errcode, &line_num);
    if (pMesh == NULL) {
      status = 0;
      if (line_num > 0) {
        fprintf(stderr, "%s: [line %ld] %s!\n",
                  pModule, line_num, lilac_mesh_errstr(errcode));
      } else {
        fprintf(stderr, "%s: %s!\n",
                  pModule, lilac_mesh_errstr(errcode));
      }
    }
  }
  
  /* Consume the rest of input, making sure nothing remains in file */
  if (status) {
    if (snsource_consume(pSrc) <= 0) {
      status = 0;
      fprintf(stderr, "%s: Failed to consume input after |;\n", 
                pModule);
    }
  }
  
  /* Print a JSON representation of the mesh */
  if (status) {
    meshToJSON(pMesh);
  }
  
  /* Release the mesh object if allocated */
  lilac_mesh_free(pMesh);
  pMesh = NULL;
  
  /* Release the Shastina source if allocated, as well as any file
   * handle owned by the source */
  snsource_free(pSrc);
  pSrc = NULL;
  
  /* Invert status and return */
  if (status) {
    status = 0;
  } else {
    status = 1;
  }
  return status;
}
