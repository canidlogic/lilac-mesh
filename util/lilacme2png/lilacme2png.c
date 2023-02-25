/*
 * lilacme2png.c
 * =============
 * 
 * Utility program that reads a Lilac mesh in the standard Shastina
 * format and compiles it to a PNG image file.
 * 
 * Syntax
 * ------
 * 
 *   lilacme2png [mode] [output] [input] [mask]
 *   lilacme2png [mode] [output] [input] [w] [h]
 * 
 * [mode] is the kind of compiled PNG file to generate.  "vector"
 * generates a PNG file that encodes vectors at each pixel.  "scalar-x"
 * generates a PNG file that encodes scalar values at each pixel, with
 * left as -1.0 and right as 1.0.  "scalar-y" generates a PNG file that
 * encodes scalar values at each pixel, with bottom as -1.0 and top as
 * 1.0.  See "MeshPNG.md" in the doc directory for further information
 * about how vector and scalar values are encoded in PNG images.
 * 
 * [output] is the path to the PNG image file to generate.  This path
 * must end with an extension that is a case-insensitive match for .png
 * 
 * [input] is the path to the Lilac mesh Shastina file to interpret.
 * 
 * [mask], if present, is a path to an existing PNG file that will serve
 * as the mask.  The dimensions of the output PNG file will match the
 * dimensions of this mask file.  Each pixel in the mask file is
 * interpreted as a grayscale value.  Grayscale values 128 or greater
 * are interpreted as white and grayscale values less than 128 are
 * interpreted as black.  White pixels will be included in the output if
 * they are also covered by the mesh, while black pixels indicate pixels
 * that are masked out, even if they are present in the mesh.
 * 
 * [w] and [h] can be used instead of [mask].  Both are integer values
 * in range [1, 16384] that indicate the width and height of the output
 * PNG file.
 * 
 * Compilation
 * -----------
 * 
 * This program has the following dependencies:
 * 
 * - libsophistry
 * - libpng (for libsophistry)
 * - libshastina
 * - lilac_mesh
 * - lm for the <math.h> library
 */

#include <ctype.h>
#include <errno.h>
#include <math.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "lilac_mesh.h"
#include "shastina.h"
#include "sophistry.h"

/*
 * Constants
 * ---------
 */

/*
 * Coordinates less than this distance from each other can be considered
 * equivalent within the ivec_atX() and ivec_atY() functions.
 */
#define IVEC_THETA (0.00001)

/*
 * The maximum value for output image width and height.
 */
#define MAX_IMAGE_DIM (16384)

/*
 * The maximum number of pixels in the output image.
 * 
 * The maximum size in bytes of the memory buffer will be this value
 * multiplied by 4 (bytes per pixel).
 */
#define MAX_IMAGE_PIXELS INT32_C(16777216)

/*
 * The minimum and maximum angles for slerp interpolation.
 * 
 * When the angle between unit vectors to interpolate is close to zero
 * or 180 degrees, the denominator used in slerp interpolation
 * approaches zero.  To avoid numeric problems, when interpolating
 * between vectors whose angle is close to zero or 180 degrees, linear
 * interpolation should be used instead.
 * 
 * These constants define the boundaries of where slerp interpolation
 * can be used, measured in radians.
 */
#define MIN_SLERP_ANGLE (M_PI / 1024.0)
#define MAX_SLERP_ANGLE (M_PI - (M_PI / 1024.0))

/*
 * Interpolation modes.
 * 
 * INTER_UNDEF means the mode has not been defined yet.
 * 
 * INTER_SCALAR means that a scalar value in range [-1.0, 1.0] is
 * linearly interpolated.
 * 
 * INTER_VECTOR means that a 3D unit vector is interpolated with slerp.
 */
#define INTER_UNDEF  (0)
#define INTER_SCALAR (1)
#define INTER_VECTOR (2)

/*
 * Vertex conversion modes.
 * 
 * VMODE_UNDEF means the mode has not been defined yet.
 * 
 * VMODE_X means the horizontal direction will be converted into a
 * scalar value in range [-1.0, 1.0].
 * 
 * VMODE_Y means the vertical direction will be converted into a scalar
 * value in range [-1.0, 1.0].
 * 
 * VMODE_3D means each vertex normal will be converted into a 3D unit
 * vector.
 */
#define VMODE_UNDEF (0)
#define VMODE_X     (1)
#define VMODE_Y     (2)
#define VMODE_3D    (3)

/*
 * IVEC modes.
 * 
 * IMODE_SCALAR means linear interpolation in scalar mode.
 * 
 * IMODE_VLINEAR means linear interpolation in vector mode.  This is
 * only used when the angle between the unit vectors is close to zero.
 * In this case, linear interpolation is used, and then interpolated
 * results are normalized.
 * 
 * IMODE_SLERP means slerp interpolation in vector mode.  The angle must
 * not be close to zero or 180 degrees.
 * 
 * IMODE_DOUBLE means double-slerp interpolation in vector mode.  This
 * is only used when the angle between the unit vectors is close to 180
 * degrees.  This can only happen in lilac meshes when both unit vectors
 * are close to 90 degrees away from the viewer, and both unit vectors
 * are approximately on opposite sides of the unit sphere.  We handle
 * this by combining two separate slerp operations, one going from the
 * first unit vector to a vector pointing directly at the viewer, and
 * the other going from the vector pointing directly at the viewer to
 * the second unit vector.  t in [0.0, 0.5] is mapped to the first slerp
 * [0.0, 1.0] and t in [0.5, 1.0] is mapped to the second slerp
 * [0.0, 1.0].
 */
#define IMODE_SCALAR  (1)
#define IMODE_VLINEAR (2)
#define IMODE_SLERP   (3)
#define IMODE_DOUBLE  (4)

/*
 * Type declarations
 * -----------------
 */

/*
 * Represents a triangle vertex.
 */
typedef struct {
  
  /*
   * The X coordinate of this vertex, in the graphics buffer space.
   */
  double x;
  
  /*
   * The Y coordinate of this vertex, in the graphics buffer space.
   */
  double y;
  
  /*
   * The interpolated scalar value, in INTER_SCALAR interpolation mode.
   * 
   * Must be in range [-1.0f, 1.0f].
   */
  float v;
  
  /*
   * The unit vector X value, in INTER_VECTOR interpolation mode.
   * 
   * Must be in range [-1.0f, 1.0f].
   */
  float vx;
  
  /*
   * The unit vector Y value, in INTER_VECTOR interpolation mode.
   * 
   * Must be in range [-1.0f, 1.0f].
   */
  float vy;
  
  /*
   * The unit vector Z value, in INTER_VECTOR interpolation mode.
   * 
   * Negative values are not allowed, because the lilac mesh format is
   * not able to represent normals that point away from the viewer.
   * 
   * Must be in range [0.0f, 1.0f].
   */
  float vz;
  
} VERTEX;

/*
 * Represents an edge with two vertices.
 */
typedef struct {
  const VERTEX *v1;
  const VERTEX *v2;
} EDGE;

/*
 * Vector interpolation structure.
 * 
 * Use ivec_ functions to interact with this structure.
 */
typedef struct {

  /*
   * Copies of the vertices.
   * 
   * v1 is the vertex state at t=0 while v2 is the vertex state at t=1.
   */
  VERTEX v1;
  VERTEX v2;
  
  /*
   * The interpolation mode, which is one of the IMODE_ constants.
   */
  int mode;
  
  /*
   * The spherical angle between the vectors, in radians.
   * 
   * Only valid if mode is IMODE_SLERP.
   */
  double angle;
  
  /*
   * The computed value of sin(angle), which is the denominator.
   * 
   * Only valid if mode is IMODE_SLERP.
   */
  double denom;
  
} IVEC;

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
 * Interpolation and vertex conversion modes.
 * 
 * These are set during the program entrypoint.
 */
static int m_inter = INTER_UNDEF;
static int m_vmode = VMODE_UNDEF;

/*
 * The pixel buffer.
 * 
 * pBuf is non-NULL when initialized.
 * 
 * When initialized, m_w and m_h store the width and height in pixels of
 * the buffer.  pBuf then points to the actual pixels.  Each pixel is a
 * uint32_t value.  Within scanlines, pixels are ordered from left to
 * right, and scanlines are ordered from top to bottom.
 * 
 * Pixel values are encoded in the format expected by Sophistry.
 * 
 * After reading through a mask file, the width and height of this
 * buffer will match the mask file, all RGB channels within each pixel
 * will be set to zero, and alpha channels within each pixel will be set
 * to 255 (fully opaque) if the mask file indicates the pixel is masked
 * off, or 0 (fully transparent) if the mask file indicates the pixel is
 * not masked off and should be written.
 * 
 * If no mask file is provided, the width and height of this buffer will
 * match the given dimensions, and all pixels will be set to an encoded
 * ARGB value of zero.  This is equivalent to if a mask file had been
 * provided with matching dimensions and every pixel set to full white.
 */
static int32_t m_w = 0;
static int32_t m_h = 0;
static uint32_t *pBuf = NULL;

/*
 * The parsed Lilac mesh.
 * 
 * When initialized, set to non-NULL value.
 */
static LILAC_MESH *pMesh = NULL;

/*
 * Local functions
 * ---------------
 */

/* Prototypes */
static void raiseErr(int sourceLine);
static int32_t parseInt32Arg(const char *pStr);

static int32_t ifloor(double f);
static int32_t iinc(int32_t v);
static int32_t idec(int32_t v);

static void checkVertex(const VERTEX *pv);
static uint32_t vertexColor(const VERTEX *pv);
static void convertVertex(VERTEX *pv, const LILAC_MESH_POINT *pp);

static void ivec_init(IVEC *piv, const VERTEX *v1, const VERTEX *v2);
static void ivec_compute(VERTEX *pr, const IVEC *piv, double t);
static void ivec_atX(VERTEX *pr, const IVEC *piv, double x);
static void ivec_atY(VERTEX *pr, const IVEC *piv, double y);

static void renderSpan(const VERTEX *v1, const VERTEX *v2);
static void renderPair(
    const VERTEX * va1,
    const VERTEX * va2,
    const VERTEX * vb1,
    const VERTEX * vb2);
static void renderTri(
    const VERTEX * v1,
    const VERTEX * v2,
    const VERTEX * v3);

static void initBufMask(const char *pMaskPath);
static void initBufDim(int32_t w, int32_t h);

/*
 * Stop on an error.
 * 
 * Use __LINE__ for the argument so that the position of the error will
 * be reported.
 * 
 * This function will not return.
 * 
 * Parameters:
 * 
 *   sourceLine - the line number in the source file the error happened
 */
static void raiseErr(int sourceLine) {
  fprintf(stderr, "%s: Stopped on error in %s at line %d!\n",
          pModule, __FILE__, sourceLine);
  exit(1);
}

/*
 * Parse a signed decimal integer program argument.
 * 
 * Parameters:
 * 
 *   pStr - the argument to parse
 * 
 * Return:
 * 
 *   the parsed integer value
 */
static int32_t parseInt32Arg(const char *pStr) {
  long retval = 0;
  char *endptr = NULL;
  
  /* Check parameter */
  if (pStr == NULL) {
    raiseErr(__LINE__);
  }
  
  /* Check that value does not begin with whitespace */
  if (isspace(pStr[0])) {
    fprintf(stderr, "%s: Failed to parse integer program argument!\n",
            pModule);
    raiseErr(__LINE__);
  }
  
  /* Parse integer value */
  errno = 0;
  retval = strtol(pStr, &endptr, 10);
  if (errno) {
    fprintf(stderr, "%s: Failed to parse integer program argument!\n",
            pModule);
    raiseErr(__LINE__);
  }
  if (endptr != NULL) {
    if (*endptr != 0) {
      fprintf(stderr, "%s: Failed to parse integer program argument!\n",
            pModule);
      raiseErr(__LINE__);
    }
  }
  
  /* Check range */
  if ((retval > INT32_MAX) || (retval < INT32_MIN)) {
    fprintf(stderr, "%s: Failed to parse integer program argument!\n",
            pModule);
    raiseErr(__LINE__);
  }
  
  /* Return value */
  return (int32_t) retval;
}

/*
 * Floor a floating-point value to an integer, checking for overflow of
 * integer range and also that input is finite.
 * 
 * Parameters:
 * 
 *   f - the value to floor
 * 
 * Return:
 * 
 *   the floored value
 */
static int32_t ifloor(double f) {
  /* Floor the value */
  f = floor(f);
  
  /* Check we got a finite result */
  if (!isfinite(f)) {
    fprintf(stderr, "%s: Numeric problem!\n", pModule);
    raiseErr(__LINE__);
  }
  
  /* Check result is in integer range */
  if (!((f >= ((double) INT32_MIN)) &&
          (f <= ((double) INT32_MAX)))) {
    fprintf(stderr, "%s: Integer range overflow!\n", pModule);
    raiseErr(__LINE__);
  }
  
  /* Return integer conversion */
  return (int32_t) f;
}

/*
 * Increment a given value, checking for overflow.
 * 
 * Parameters:
 * 
 *   v - the value
 * 
 * Return:
 * 
 *   one greater than the value
 */
static int32_t iinc(int32_t v) {
  if (v >= INT32_MAX) {
    fprintf(stderr, "%s: Integer range exceeded!\n", pModule);
    raiseErr(__LINE__);
  }
  return (v + 1);
}

/*
 * Decrement a given value, checking for overflow.
 * 
 * Parameters:
 * 
 *   v - the value
 * 
 * Return:
 * 
 *   one less than the value
 */
static int32_t idec(int32_t v) {
  if (v <= INT32_MIN) {
    fprintf(stderr, "%s: Integer range exceeded!\n", pModule);
    raiseErr(__LINE__);
  }
  return (v - 1);
}

/*
 * Check that all relevant fields of the vertex have valid values.
 * 
 * The m_inter variable must be set, to determine which parts of the
 * vertex structure are relevant.
 * 
 * Parameters:
 * 
 *   pv - the vertex to check
 */
static void checkVertex(const VERTEX *pv) {
  if (pv == NULL) {
    raiseErr(__LINE__);
  }
  
  if (!(isfinite(pv->x) && isfinite(pv->y))) {
    fprintf(stderr, "%s: Non-finite vertex!\n", pModule);
    raiseErr(__LINE__);
  }
  
  if (m_inter == INTER_SCALAR) {
    if (!isfinite(pv->v)) {
      fprintf(stderr, "%s: Non-finite vertex!\n", pModule);
      raiseErr(__LINE__);
    }
    
  } else if (m_inter == INTER_VECTOR) {
    if (!(
          isfinite(pv->vx) &&
          isfinite(pv->vy) &&
          isfinite(pv->vz)
        )) {
      fprintf(stderr, "%s: Non-finite vertex!\n", pModule);
      raiseErr(__LINE__);
    }
    
  } else {
    raiseErr(__LINE__);
  }
}

/*
 * Compute a packed ARGB color from a vertex.
 * 
 * m_inter must be set to determine the color mode.
 * 
 * Parameters:
 * 
 *   pv - the vertex
 * 
 * Return:
 * 
 *   a packed ARGB color in Sophistry format
 */
static uint32_t vertexColor(const VERTEX *pv) {
  
  float rf = 0.0f;
  float gf = 0.0f;
  float bf = 0.0f;
  
  uint32_t ri = 0;
  uint32_t gi = 0;
  uint32_t bi = 0;
  
  uint32_t result = 0;
  
  /* Check parameters */
  checkVertex(pv);
  
  /* Different handling depending on mode */
  if (m_inter == INTER_SCALAR) {
    /* Get the grayscale value in floating-point space */
    gf = (float) floor((((pv->v + 1.0f) / 2.0f) * 254.0f) + 1.0f);
    
    /* Make sure value is at least one */
    if (!(gf >= 1.0f)) {
      gf = 1.0f;
    }
    
    /* Convert to unsigned integer and clamp to [1, 255] */
    gi = (uint32_t) gf;
    
    if (gi > 255) {
      gi = 255;
    } else if (gi < 1) {
      gi = 1;
    }
    
    /* Compute result */
    result = UINT32_C(0xff000000) | (gi << 16) | (gi << 8) | gi;
    
  } else if (m_inter == INTER_VECTOR) {
    /* Get the RGB values in floating-point space */
    rf = (float) floor((((pv->vx + 1.0f) / 2.0f) * 254.0f) + 1.0f);
    gf = (float) floor((((pv->vy + 1.0f) / 2.0f) * 254.0f) + 1.0f);
    bf = (float) floor((((pv->vz + 1.0f) / 2.0f) * 254.0f) + 1.0f);
    
    /* Make sure values are at least one */
    if (!(rf >= 1.0f)) {
      rf = 1.0f;
    }
    if (!(gf >= 1.0f)) {
      gf = 1.0f;
    }
    if (!(bf >= 1.0f)) {
      bf = 1.0f;
    }
    
    /* Convert to unsigned integers and clamp to [1, 255] */
    ri = (uint32_t) rf;
    gi = (uint32_t) gf;
    bi = (uint32_t) bf;
    
    if (ri > 255) {
      ri = 255;
    } else if (ri < 1) {
      ri = 1;
    }
    
    if (gi > 255) {
      gi = 255;
    } else if (gi < 1) {
      gi = 1;
    }
    
    if (bi > 255) {
      bi = 255;
    } else if (bi < 1) {
      bi = 1;
    }
    
    /* Compute result */
    result = UINT32_C(0xff000000) | (ri << 16) | (gi << 8) | bi;
    
  } else {
    raiseErr(__LINE__);
  }
  
  /* Return result */
  return result;
}

/*
 * Convert a lilac mesh point into a vertex that can be rendered.
 * 
 * The m_vmode state variable must be set and the graphics buffer must
 * be allocated.  This is necessary so the mesh points can be converted
 * in the appropriate way.
 * 
 * Parameters:
 * 
 *   pv - the vertex to store the converted results in
 * 
 *   pp - the lilac mesh point to convert
 */
static void convertVertex(VERTEX *pv, const LILAC_MESH_POINT *pp) {
  
  double ad = 0.0;
  double aa = 0.0;
  
  /* Check state */
  if (pBuf == NULL) {
    raiseErr(__LINE__);
  }
  
  /* Check parameters */
  if ((pv == NULL) || (pp == NULL)) {
    raiseErr(__LINE__);
  }
  
  /* Clear output vertex */
  memset(pv, 0, sizeof(VERTEX));
  
  /* X and Y are first converted into floating point [0.0, 1.0] range */
  pv->x = ((double) pp->x) / ((double) LILAC_MESH_MAX_C);
  pv->y = ((double) pp->y) / ((double) LILAC_MESH_MAX_C);
  
  /* Y coordinate in lilac mesh has Y axis pointing upwards, while
   * graphics buffer has Y axis pointing downwards, so invert Y */
  pv->y = 1.0 - pv->y;
  
  /* Now multiply both coordinates by one less than width and height
   * respectively to get coordinates in scale of image */
  pv->x *= ((double) (m_w - 1));
  pv->y *= ((double) (m_h - 1));
  
  /* Floor coordinates to integer and add 0.5 so they are right in the
   * center of pixels */
  pv->x = floor(pv->x) + 0.5;
  pv->y = floor(pv->y) + 0.5;
  
  /* Get normalized normd and norma into ad and aa */
  ad = ((double) pp->normd) / ((double) LILAC_MESH_MAX_C);
  aa = ((double) pp->norma) / ((double) LILAC_MESH_MAX_C);
  
  /* Convert aa into radians */
  aa = aa * 2.0 * M_PI;
  
  /* Compute the vx and vy vectors in a 2D circle using the lilac normal
   * information */
  pv->vx = (float) (ad * cos(aa));
  pv->vy = (float) (ad * sin(aa));
  
  /* Convert the normal depending on vector conversion mode */
  if (m_vmode == VMODE_X) {
    /* Just use the vx vector */
    pv->v = pv->vx;
    
  } else if (m_vmode == VMODE_Y) {
    /* Just use the vy vector */
    pv->v = pv->vy;
    
  } else if (m_vmode == VMODE_3D) {
    /* Compute vz so as to make the vector a unit vector */
    pv->vz = 1.0f - (pv->vx * pv->vx) - (pv->vy * pv->vy);
    if (!(pv->vz >= 0.0f)) {
      pv->vz = 0.0f;
    }
    pv->vz = sqrt(pv->vz);
    
  } else {
    /* m_vmode is not set */
    raiseErr(__LINE__);
  }
  
  /* Check that the converted vertex is valid */
  checkVertex(pv);
}

/*
 * Initialize an interpolation structure.
 * 
 * Pass the vertices that are being interpolated.  v1 is the vertex
 * state at t=0 and v2 is the vertex state at t=1.  Both pointers may
 * indicate the same structure.
 * 
 * Full copies of the two vertices are copied into the structure, so
 * changes to the passed structures after initialization have no effect
 * on the interpolation.
 * 
 * m_inter must be set to determine the interpolation mode.
 * 
 * There is no need to deinitialize interpolation structures.
 * 
 * Parameters:
 * 
 *   pic - the structure to reset
 */
static void ivec_init(IVEC *piv, const VERTEX *v1, const VERTEX *v2) {
  
  double angle = 0.0;
  
  /* Check parameters */
  if (piv == NULL) {
    raiseErr(__LINE__);
  }
  checkVertex(v1);
  checkVertex(v2);
  
  /* Reset structure */
  memset(piv, 0, sizeof(IVEC));
  
  /* Copy the vertices in */
  memcpy(&(piv->v1), v1, sizeof(VERTEX));
  memcpy(&(piv->v2), v2, sizeof(VERTEX));
  
  /* Initialize rest of structure */
  if (m_inter == INTER_SCALAR) {
    /* Scalar interpolation always uses scalar mode */
    piv->mode = IMODE_SCALAR;
    
  } else if (m_inter == INTER_VECTOR) {
    /* Vector interpolation, so begin by computing angle -- since both
     * vertices store a unit vector, we can just take the arc-cosine
     * of the dot product to get the angle */
    angle = (double) (
      (v1->vx * v2->vx) + (v1->vy * v2->vy) + (v1->vz * v2->vz)
    );
    
    if (!isfinite(angle)) {
      fprintf(stderr, "%s: Numeric problem!\n", pModule);
      raiseErr(__LINE__);
    }
    
    if (!(angle >= -1.0)) {
      angle = -1.0;
    } else if (!(angle <= 1.0)) {
      angle = 1.0;
    }
    
    angle = acos(angle);
    if (!isfinite(angle)) {
      fprintf(stderr, "%s: Numeric problem!\n", pModule);
      raiseErr(__LINE__);
    }
    
    /* Check angle to determine what kind of interpolation */
    if ((angle >= MIN_SLERP_ANGLE) && (angle <= MAX_SLERP_ANGLE)) {
      /* Angle is neither too close to zero nor too close to 180
       * degrees, so we can use regular slerp interpolation */
      piv->mode  = IMODE_SLERP;
      piv->angle = angle;
      piv->denom = sin(angle);
      
      if (!isfinite(piv->denom)) {
        fprintf(stderr, "%s: Numeric problem!\n", pModule);
        raiseErr(__LINE__);
      }
      
    } else if (angle < MIN_SLERP_ANGLE) {
      /* Angle is close to zero, so use linear interpolation because
       * slerp approaches linear interpolation near zero and this way we
       * avoid division by zero */
      piv->mode = IMODE_VLINEAR;
       
    } else if (angle > MAX_SLERP_ANGLE) {
      /* Angle is close to 180 degrees, so use double slerp
       * interpolation */
      piv->mode = IMODE_DOUBLE;
      
    } else {
      raiseErr(__LINE__);
    }
    
  } else {
    /* m_inter is not set */
    raiseErr(__LINE__);
  }
}

/*
 * Perform vertex interpolation.
 * 
 * pr is the vertex to store the interpolated result in.  piv points to
 * an IVEC structure initialized with ivec_init().
 * 
 * t is the time value to compute the interpolation at.  t must be
 * finite, and this function will clamp its value to range [0.0, 1.0].
 * 
 * Parameters:
 * 
 *   pr - place to store the interpolated result vertex
 * 
 *   piv - the initialized interpolation structure
 * 
 *   t - the time to interpolate the vertex at
 */
static void ivec_compute(VERTEX *pr, const IVEC *piv, double t) {
  
  float f = 0.0f;
  float tf = 0.0f;
  double d = 0.0;
  double a = 0.0;
  double b = 0.0;
  
  /* Check parameters */
  if ((pr == NULL) || (piv == NULL)) {
    raiseErr(__LINE__);
  }
  if (!isfinite(t)) {
    raiseErr(__LINE__);
  }
  
  /* Clamp t */
  if (!(t >= 0.0)) {
    t = 0.0;
  } else if (!(t <= 1.0)) {
    t = 1.0;
  }
  
  /* Store float version of t in tf */
  tf = (float) t;
  
  /* Clear result structure */
  memset(pr, 0, sizeof(VERTEX));
  
  /* Perform linear interpolation on coordinates */
  pr->x = ((piv->v1).x * (1.0 - t)) + ((piv->v2).x * t);
  pr->y = ((piv->v1).y * (1.0 - t)) + ((piv->v2).y * t);
  
  if (!(isfinite(pr->x) && isfinite(pr->y))) {
    fprintf(stderr, "%s: Numeric problem!\n", pModule);
    raiseErr(__LINE__);
  }
  
  /* Perform interpolation on additional vertex data */
  if (piv->mode == IMODE_SCALAR) {
    /* Linear interpolation on v */
    f = ((piv->v1).v * (1.0f - tf)) + ((piv->v2).v * tf);
    if (!isfinite(f)) {
      fprintf(stderr, "%s: Numeric problem!\n", pModule);
      raiseErr(__LINE__);
    }
    
    /* Clamp result to [-1.0, 1.0] */
    if (!(f >= -1.0f)) {
      f = -1.0f;
    } else if (!(f <= 1.0f)) {
      f = 1.0f;
    }
    
    /* Store result */
    pr->v = f;
    
  } else if (piv->mode == IMODE_VLINEAR) {
    /* Angle between vectors is close to zero, so just use linear
     * interpolation to avoid division by zero and also since slerp
     * approaches linear interpolation near zero */
    pr->vx = ((piv->v1).vx * (1.0f - tf)) + ((piv->v2).vx * tf);
    pr->vy = ((piv->v1).vy * (1.0f - tf)) + ((piv->v2).vy * tf);
    pr->vz = ((piv->v1).vz * (1.0f - tf)) + ((piv->v2).vz * tf);
    
    if (!(isfinite(pr->vx) && isfinite(pr->vy) && isfinite(pr->vz))) {
      fprintf(stderr, "%s: Numeric problem!\n", pModule);
      raiseErr(__LINE__);
    }
    
  } else if (piv->mode == IMODE_SLERP) { 
    /* Angle between vectors is neither close to zero nor close to 180
     * degrees, so we can use regular slerp */
    a = sin((1.0 - t) * piv->angle);
    b = sin(       t  * piv->angle);
    
    if (!(isfinite(a) && isfinite(b))) {
      fprintf(stderr, "%s: Numeric problem!\n", pModule);
      raiseErr(__LINE__);
    }
    
    d = ((a * ((double) (piv->v1).vx)) + (b * ((double) (piv->v2).vx)))
          / piv->denom;
    
    if (!isfinite(d)) {
      fprintf(stderr, "%s: Numeric problem!\n", pModule);
      raiseErr(__LINE__);
    }
    
    pr->vx = (float) d;
    
    d = ((a * ((double) (piv->v1).vy)) + (b * ((double) (piv->v2).vy)))
          / piv->denom;
    
    if (!isfinite(d)) {
      fprintf(stderr, "%s: Numeric problem!\n", pModule);
      raiseErr(__LINE__);
    }
    
    pr->vy = (float) d;
    
    d = ((a * ((double) (piv->v1).vz)) + (b * ((double) (piv->v2).vz)))
          / piv->denom;
    
    if (!isfinite(d)) {
      fprintf(stderr, "%s: Numeric problem!\n", pModule);
      raiseErr(__LINE__);
    }
    
    pr->vz = (float) d;
    
    if (!(isfinite(pr->vx) && isfinite(pr->vy) && isfinite(pr->vz))) {
      fprintf(stderr, "%s: Numeric problem!\n", pModule);
      raiseErr(__LINE__);
    }
    
  } else if (piv->mode == IMODE_DOUBLE) { 
    /* Angle between vectors is close to 180 degrees, so we use two
     * separate slerp interpolations, using the unit vector pointing
     * along the Z axis as the halfway point since vectors at 180
     * degrees in lilac meshes are always on opposite ends of the circle
     * in the XY plane */
    if (t < 0.5) {
      /* t is in first half, so double t to get the local t value in the
       * first interpolation curve */
      t *= 2.0;
      
      /* Use slerp from first vertex vector to a vector (0, 0, 1); angle
       * can be assumed to be 90 degrees, and denominator can then be
       * assumed to be 1.0 */
      a = sin((1.0 - t) * M_PI_2);
      b = sin(       t  * M_PI_2);
      
      if (!(isfinite(a) && isfinite(b))) {
        fprintf(stderr, "%s: Numeric problem!\n", pModule);
        raiseErr(__LINE__);
      }
      
      d = a * ((double) (piv->v1).vx);
      
      if (!isfinite(d)) {
        fprintf(stderr, "%s: Numeric problem!\n", pModule);
        raiseErr(__LINE__);
      }
      
      pr->vx = (float) d;
      
      d = a * ((double) (piv->v1).vy);
      
      if (!isfinite(d)) {
        fprintf(stderr, "%s: Numeric problem!\n", pModule);
        raiseErr(__LINE__);
      }
      
      pr->vy = (float) d;
      
      d = (a * ((double) (piv->v1).vz)) + b;
      
      if (!isfinite(d)) {
        fprintf(stderr, "%s: Numeric problem!\n", pModule);
        raiseErr(__LINE__);
      }
      
      pr->vz = (float) d;
      
      if (!(isfinite(pr->vx) && isfinite(pr->vy) && isfinite(pr->vz))) {
        fprintf(stderr, "%s: Numeric problem!\n", pModule);
        raiseErr(__LINE__);
      }
      
    } else {
      /* t is in second half, so get offset from 0.5 and double that to
       * get the local t value in the second interpolation curve */
      t = (t - 0.5) * 2.0;
      
      /* Use slerp from first vertex vector to a vector (0, 0, 1); angle
       * can be assumed to be 90 degrees, and denominator can then be
       * assumed to be 1.0 */
      a = sin((1.0 - t) * M_PI_2);
      b = sin(       t  * M_PI_2);
      
      if (!(isfinite(a) && isfinite(b))) {
        fprintf(stderr, "%s: Numeric problem!\n", pModule);
        raiseErr(__LINE__);
      }
      
      d = b * ((double) (piv->v2).vx);
      
      if (!isfinite(d)) {
        fprintf(stderr, "%s: Numeric problem!\n", pModule);
        raiseErr(__LINE__);
      }
      
      pr->vx = (float) d;
      
      d = b * ((double) (piv->v2).vy);
      
      if (!isfinite(d)) {
        fprintf(stderr, "%s: Numeric problem!\n", pModule);
        raiseErr(__LINE__);
      }
      
      pr->vy = (float) d;
      
      d = a + (b * ((double) (piv->v2).vz));
      
      if (!isfinite(d)) {
        fprintf(stderr, "%s: Numeric problem!\n", pModule);
        raiseErr(__LINE__);
      }
      
      pr->vz = (float) d;
      
      if (!(isfinite(pr->vx) && isfinite(pr->vy) && isfinite(pr->vz))) {
        fprintf(stderr, "%s: Numeric problem!\n", pModule);
        raiseErr(__LINE__);
      }
    }
    
  } else {
    raiseErr(__LINE__);
  }
}

/*
 * Perform vertex interpolation such that the interpolated X coordinate
 * matches the given coordinate.
 * 
 * pr is the vertex to store the interpolated result in.  piv points to
 * an IVEC structure initialized with ivec_init().
 * 
 * x is the X coordinate that pr will have in its interpolated results.
 * x must be within the range of X coordinates covered by the two
 * vertices in the interpolated structure.
 * 
 * Parameters:
 * 
 *   pr - place to store the interpolated result vertex
 * 
 *   piv - the initialized interpolation structure
 * 
 *   x - the desired interpolated X coordinate
 */
static void ivec_atX(VERTEX *pr, const IVEC *piv, double x) {
  
  double min_x = 0.0;
  double max_x = 0.0;
  double denom = 0.0;
  double t = 0.0;
  int reverse = 0;
  
  /* Check parameters */
  if ((pr == NULL) || (piv == NULL)) {
    raiseErr(__LINE__);
  }
  if (!isfinite(x)) {
    raiseErr(__LINE__);
  }
  
  /* Figure out the minimum and maximum X coordinates of the two
   * endpoint vertices, and whether we are in reverse (proceeding from
   * maximum to minimum instead of minimum to maximum) */
  if ((piv->v1).x <= (piv->v2).x) {
    min_x   = (piv->v1).x;
    max_x   = (piv->v2).x;
    reverse = 0;
    
  } else {
    min_x   = (piv->v2).x;
    max_x   = (piv->v1).x;
    reverse = 1;
  }
  
  /* Check that given X coordinate is in range */
  if (!((x >= min_x) && (x <= max_x))) {
    raiseErr(__LINE__);
  }
  
  /* Compute how far along we are from minimum to maximum; if minimum
   * and maximum extents are close enough to each other, just use a
   * value of 0.0 to avoid division by zero */
  denom = max_x - min_x;
  if (denom >= IVEC_THETA) {
    t = (x - min_x) / (max_x - min_x);
    if (!isfinite(t)) {
      fprintf(stderr, "%s: Numeric problem!\n", pModule);
      raiseErr(__LINE__);
    }
    
  } else {
    t = 0.0;
  }
  
  /* If reverse flag is on, reverse t */
  if (reverse) {
    t = 1.0 - t;
  }
  
  /* Interpolate at t, which should have X close to the given X in the
   * interpolated results */
  ivec_compute(pr, piv, t);
  
  /* Force the interpolated X coordinate to the given X since it should
   * be very close */
  pr->x = x;
}

/*
 * Perform vertex interpolation such that the interpolated Y coordinate
 * matches the given coordinate.
 * 
 * pr is the vertex to store the interpolated result in.  piv points to
 * an IVEC structure initialized with ivec_init().
 * 
 * y is the Y coordinate that pr will have in its interpolated results.
 * y must be within the range of Y coordinates covered by the two
 * vertices in the interpolated structure.
 * 
 * Parameters:
 * 
 *   pr - place to store the interpolated result vertex
 * 
 *   piv - the initialized interpolation structure
 * 
 *   y - the desired interpolated Y coordinate
 */
static void ivec_atY(VERTEX *pr, const IVEC *piv, double y) {
  
  double min_y = 0.0;
  double max_y = 0.0;
  double denom = 0.0;
  double t = 0.0;
  int reverse = 0;
  
  /* Check parameters */
  if ((pr == NULL) || (piv == NULL)) {
    raiseErr(__LINE__);
  }
  if (!isfinite(y)) {
    raiseErr(__LINE__);
  }
  
  /* Figure out the minimum and maximum Y coordinates of the two
   * endpoint vertices, and whether we are in reverse (proceeding from
   * maximum to minimum instead of minimum to maximum) */
  if ((piv->v1).y <= (piv->v2).y) {
    min_y   = (piv->v1).y;
    max_y   = (piv->v2).y;
    reverse = 0;
    
  } else {
    min_y   = (piv->v2).y;
    max_y   = (piv->v1).y;
    reverse = 1;
  }
  
  /* Check that given Y coordinate is in range */
  if (!((y >= min_y) && (y <= max_y))) {
    raiseErr(__LINE__);
  }
  
  /* Compute how far along we are from minimum to maximum; if minimum
   * and maximum extents are close enough to each other, just use a
   * value of 0.0 to avoid division by zero */
  denom = max_y - min_y;
  if (denom >= IVEC_THETA) {
    t = (y - min_y) / (max_y - min_y);
    if (!isfinite(t)) {
      fprintf(stderr, "%s: Numeric problem!\n", pModule);
      raiseErr(__LINE__);
    }
    
  } else {
    t = 0.0;
  }
  
  /* If reverse flag is on, reverse t */
  if (reverse) {
    t = 1.0 - t;
  }
  
  /* Interpolate at t, which should have Y close to the given Y in the
   * interpolated results */
  ivec_compute(pr, piv, t);
  
  /* Force the interpolated Y coordinate to the given Y since it should
   * be very close */
  pr->y = y;
}

/*
 * Render an interpolated span within a scanline.
 * 
 * v1 and v2 are the start and end vertices on the scanline.  They may
 * be in any order, and they may be the same structure.  However, they
 * must have exactly the same Y coordinate.
 * 
 * Clipping will be performed according to the dimensions of the pixel
 * buffer.
 * 
 * Parameters:
 * 
 *   v1 - the first vertex
 * 
 *   v2 - the second vertex
 */
static void renderSpan(const VERTEX *v1, const VERTEX *v2) {
  
  const VERTEX *tv = NULL;
  IVEC iv;
  VERTEX vx;
  
  int32_t x     = 0;
  int32_t x_min = 0;
  int32_t x_max = 0;
  int32_t y = 0;
  
  uint32_t *ps = NULL;
  
  /* Initialize structures */
  memset(&iv, 0, sizeof(IVEC));
  memset(&vx, 0, sizeof(VERTEX));
  
  /* Check state */
  if (pBuf == NULL) {
    raiseErr(__LINE__);
  }
  
  /* Check parameters */
  checkVertex(v1);
  checkVertex(v2);
  if (v1->y != v2->y) {
    raiseErr(__LINE__);
  }
  
  /* Swap parameters if necessary so that X coordinate of v1 is less
   * than or equal to X coordinate of v2 */
  if (!(v1->x <= v2->x)) {
    tv = v1;
    v1 = v2;
    v2 = tv;
  }
  
  /* Get the integer Y and X extent coordinates */
  y     = ifloor(v1->y);
  x_min = ifloor(v1->x);
  x_max = ifloor(v2->x);
  
  /* If distance from x_min to actual X coordinate is greater than 0.5,
   * then increment x_min by one; center of pixel is included in
   * rendered range because of top-left rule */
  if (v1->x - ((double) x_min) > 0.5) {
    x_min = iinc(x_min);
  }
  
  /* If distance from x_max to actual X coordinate is less than or equal
   * to 0.5, then decrement x_max by one; center of pixel is excluded
   * from rendered range because of top-left rule */
  if (v2->x - ((double) x_max) <= 0.5) {
    x_max = idec(x_max);
  }
  
  /* If x_min and x_max have crossed, nothing to render */
  if (x_max < x_min) {
    return;
  }
  
  /* Perform clipping */
  if ((y < 0) || (y >= m_h)) {
    return;
  }
  if ((x_max < 0) || (x_min >= m_w)) {
    return;
  }
  
  /* Clamp x_min and x_max to graphics buffer */
  if (x_min < 0) {
    x_min = 0;
  }
  if (x_max >= m_w) {
    x_max = m_w - 1;
  }
  
  /* Initialize interpolation structure */
  ivec_init(&iv, v1, v2);
  
  /* Get pointer to first pixel in graphics buffer */
  ps = &(pBuf[(y * m_w) + x_min]);
  
  /* Iterate through all pixels and render them */
  for(x = x_min; x <= x_max; x = iinc(x)) {
    
    /* Skip this pixel if it is masked out */
    if (*ps == UINT32_C(0xff000000)) {
      ps++;
      continue;
    }
    
    /* Interpolate this pixel */
    ivec_atX(&vx, &iv, ((double) x) + 0.5);
    
    /* Store the converted color and advance buffer pointer */
    *ps = vertexColor(&vx);
    ps++;
  }
}

/*
 * Render the scanlines filling an area between a pair of edges.
 * 
 * va1 and va2 define the endpoints of the first edge, while vb1 and vb2
 * define the endpoints of the second edge.  All pointers may indicate
 * the same structure.
 * 
 * Parameters:
 * 
 *   va1 - the first vertex of the first edge
 * 
 *   va2 - the second vertex of the first edge
 * 
 *   vb1 - the first vertex of the second edge
 * 
 *   vb2 - the second vertex of the second edge
 */
static void renderPair(
    const VERTEX * va1,
    const VERTEX * va2,
    const VERTEX * vb1,
    const VERTEX * vb2) {
  
  const VERTEX *tv = NULL;
  
  double ys    = 0.0;
  double min_y = 0.0;
  double max_y = 0.0;
  
  int32_t y        = 0;
  int32_t start_y  = 0;
  int32_t finish_y = 0;
  
  IVEC e1;
  IVEC e2;
  VERTEX ve1;
  VERTEX ve2;
  
  /* Initialize structures */
  memset( &e1, 0, sizeof(IVEC));
  memset( &e2, 0, sizeof(IVEC));
  memset(&ve1, 0, sizeof(VERTEX));
  memset(&ve2, 0, sizeof(VERTEX));
  
  /* Check state */
  if (pBuf == NULL) {
    raiseErr(__LINE__);
  }
  
  /* Check parameters */
  checkVertex(va1);
  checkVertex(va2);
  checkVertex(vb1);
  checkVertex(vb2);
  
  /* Within each edge, flip vertices if necessary so that first vertex Y
   * is less than or equal to second vertex Y */
  if (!(va1->y <= va2->y)) {
    tv = va1;
    va1 = va2;
    va2 = tv;
  }
  if (!(vb1->y <= vb2->y)) {
    tv = vb1;
    vb1 = vb2;
    vb2 = tv;
  }
  
  /* Get the Y extent that is the intersection of the Y extents of the
   * two edges; if intersection is empty, then nothing to render */
  min_y = va1->y;
  max_y = va2->y;
  
  if (!((vb1->y <= max_y) && (vb2->y >= min_y))) {
    /* Non-overlapping Y extents */
    return;
  }
  
  if (vb1->y > min_y) {
    min_y = vb1->y;
  }
  if (vb2->y < max_y) {
    max_y = vb2->y;
  }
  
  /* Get integer floors of the intersected extent */
  start_y  = ifloor(min_y);
  finish_y = ifloor(max_y);
  
  /* If distance from starting Y to actual minimum Y is greater than 0.5
   * then increment starting Y; we include the exact pixel center here
   * due to the top-left rule */
  if (min_y - ((double) start_y) > 0.5) {
    start_y = iinc(start_y);
  }
  
  /* If distance from finish Y to actual maximum Y is less than or equal
   * to 0.5 then decrement finishing Y; we exclude the exact pixel
   * center here due to the top-left rule */
  if (max_y - ((double) finish_y) <= 0.5) {
    finish_y = idec(finish_y);
  }
  
  /* If integer extents have crossed, nothing to render */
  if (finish_y < start_y) {
    return;
  }
  
  /* Perform Y clipping */
  if ((finish_y < 0) || (start_y >= m_h)) {
    return;
  }
  
  /* Clamp Y range to graphics buffer */
  if (start_y < 0) {
    start_y = 0;
  }
  if (finish_y >= m_h) {
    finish_y = m_h - 1;
  }
  
  /* Initialize interpolation structures for the two edges */
  ivec_init(&e1, va1, va2);
  ivec_init(&e2, vb1, vb2);
  
  /* Render each scanline */
  for(y = start_y; y <= finish_y; y = iinc(y)) {
    /* Get the scanline Y coordinate, which goes through the center of
     * the pixel */
    ys = ((double) y) + 0.5;
    
    /* Interpolate both edges at ys */
    ivec_atY(&ve1, &e1, ys);
    ivec_atY(&ve2, &e2, ys);
    
    /* Render the scanline */
    renderSpan(&ve1, &ve2);
  }
}

/*
 * Render a triangle.
 * 
 * Parameters:
 * 
 *   v1 - the first vertex
 * 
 *   v2 - the second vertex
 * 
 *   v3 - the third vertex
 */
static void renderTri(
    const VERTEX * v1,
    const VERTEX * v2,
    const VERTEX * v3) {
  
  EDGE et[3];
  EDGE te;
  int i = 0;
  int long_edge = 0;
  double max_extent = 0.0;
  double ex = 0.0;
  
  /* Initialize structures and arrays */
  memset( et, 0, 3 * sizeof(EDGE));
  memset(&te, 0, sizeof(EDGE));
  
  /* Check parameters */
  checkVertex(v1);
  checkVertex(v2);
  checkVertex(v3);
  
  /* Set edges */
  (et[0]).v1 = v1;
  (et[0]).v2 = v2;
  
  (et[1]).v1 = v2;
  (et[1]).v2 = v3;
  
  (et[2]).v1 = v3;
  (et[2]).v2 = v1;
  
  /* Figure out the longest edge in terms of Y extent */
  long_edge = 0;
  max_extent = fabs(((et[0]).v1)->y - ((et[0]).v2)->y);
  if (!isfinite(max_extent)) {
    raiseErr(__LINE__);
  }
  
  for(i = 1; i < 3; i++) {
    ex = fabs(((et[i]).v1)->y - ((et[i]).v2)->y);
    if (!isfinite(ex)) {
      raiseErr(__LINE__);
    }
    
    if (ex > max_extent) {
      long_edge = i;
      max_extent = ex;
    }
  }
  
  /* Make the first edge the long one */
  if (long_edge > 0) {
    memcpy(&te, &(et[long_edge]), sizeof(EDGE));
    memcpy(&(et[long_edge]), &(et[0]), sizeof(EDGE));
    memcpy(&(et[0]), &te, sizeof(EDGE));
  }
  
  /* Render pairs of the long edge with the other two */
  renderPair((et[0]).v1, (et[0]).v2, (et[1]).v1, (et[1]).v2);
  renderPair((et[0]).v1, (et[0]).v2, (et[2]).v1, (et[2]).v2);
}

/*
 * Initialize the pixel buffer using a given PNG mask file.
 * 
 * The pixel buffer must not be already initialized.
 * 
 * Parameters:
 * 
 *   pMaskPath - path to the PNG mask file
 */
static void initBufMask(const char *pMaskPath) {
  
  int err_num = 0;
  SPH_IMAGE_READER *pr = NULL;
  int32_t x = 0;
  int32_t y = 0;
  uint32_t *ps = NULL;
  uint32_t *pb = NULL;
  uint32_t px = 0;
  SPH_ARGB col;
  
  /* Initialize structures */
  memset(&col, 0, sizeof(SPH_ARGB));
  
  /* Check state */
  if (pBuf != NULL) {
    raiseErr(__LINE__);
  }
  
  /* Check parameter */
  if (pMaskPath == NULL) {
    raiseErr(__LINE__);
  }
  
  /* Open an image reader on the PNG mask file */
  pr = sph_image_reader_newFromPath(pMaskPath, &err_num);
  if (pr == NULL) {
    fprintf(stderr, "%s: Failed to read PNG mask file: %s!\n",
            pModule, sph_image_errorString(err_num));
    raiseErr(__LINE__);
  }
  
  /* Get the mask file dimensions */
  m_w = sph_image_reader_width(pr);
  m_h = sph_image_reader_height(pr);
  
  /* Check that dimensions are in range */
  if ((m_w > MAX_IMAGE_DIM) || (m_h > MAX_IMAGE_DIM)) {
    fprintf(stderr, "%s: Output image dimensions may be at most %d!\n",
            pModule, (int) MAX_IMAGE_DIM);
    raiseErr(__LINE__);
  }
  
  if (m_w * m_h > MAX_IMAGE_PIXELS) {
    fprintf(stderr, "%s: Output image may have at most %ld pixels!\n",
            pModule, (long) MAX_IMAGE_PIXELS);
    raiseErr(__LINE__);
  }
  
  /* Allocate buffer */
  pBuf = (uint32_t *) calloc((size_t) (m_w * m_h), sizeof(uint32_t));
  if (pBuf == NULL) {
    fprintf(stderr, "%s: Memory buffer allocation failed!\n", pModule);
    raiseErr(__LINE__);
  }
  
  /* Read each mask image scanline and use to initialize the buffer */
  pb = pBuf;
  for(y = 0; y < m_h; y++) {
    /* Read a scanline */
    ps = sph_image_reader_read(pr, &err_num);
    if (ps == NULL) {
      fprintf(stderr, "%s: Failed to read mask PNG scanline: %s!\n",
              pModule, sph_image_errorString(err_num));
      raiseErr(__LINE__);
    }
    
    /* Use each pixel to initialize a pixel in the memory buffer */
    for(x = 0; x < m_w; x++) {
      /* Read current pixel */
      px = *ps;
      ps++;
      
      /* Convert ARGB value to a grayscale value */
      sph_argb_unpack(px, &col);
      sph_argb_downGray(&col);
      px = (uint32_t) col.r;
      
      /* Threshold grayscale value so that 128 and above map to a value
       * of 1 and values less than 128 map to a value of 0 */
      if (px >= 128) {
        px = 1;
      } else {
        px = 0;
      }
      
      /* Threshold values of 1 (white) mean pixel is not masked off, so
       * change to a full zero value in that case; in all other cases,
       * change to a value of alpha channel fully opaque and RGB
       * channels all zero */
      if (px) {
        px = 0;
      } else {
        px = UINT32_C(0xff000000);
      }
      
      /* Write converted pixel to memory buffer */
      *pb = px;
      pb++;
    }
  }
  
  /* Release image reader */
  sph_image_reader_close(pr);
  pr = NULL;
}

/*
 * Initialize the pixel buffer using given output image dimensions.
 * 
 * The pixel buffer must not be already initialized.
 * 
 * Parameters:
 * 
 *   pMaskPath - path to the PNG mask file
 */
static void initBufDim(int32_t w, int32_t h) {
  
  /* Check state */
  if (pBuf != NULL) {
    raiseErr(__LINE__);
  }
  
  /* Check that dimensions are in range */
  if ((w < 1) || (h < 1)) {
    fprintf(stderr, "%s: Output image dimensions must be at least 1!\n",
            pModule);
    raiseErr(__LINE__);
  }
  
  if ((w > MAX_IMAGE_DIM) || (h > MAX_IMAGE_DIM)) {
    fprintf(stderr, "%s: Output image dimensions may be at most %d!\n",
            pModule, (int) MAX_IMAGE_DIM);
    raiseErr(__LINE__);
  }
  
  if (w * h > MAX_IMAGE_PIXELS) {
    fprintf(stderr, "%s: Output image may have at most %ld pixels!\n",
            pModule, (long) MAX_IMAGE_PIXELS);
    raiseErr(__LINE__);
  }
  
  /* Store dimensions */
  m_w = w;
  m_h = h;
  
  /* Allocate buffer and initialize all pixels to full zero */
  pBuf = (uint32_t *) calloc((size_t) (m_w * m_h), sizeof(uint32_t));
  if (pBuf == NULL) {
    fprintf(stderr, "%s: Memory buffer allocation failed!\n", pModule);
    raiseErr(__LINE__);
  }
}

/*
 * Program entrypoint
 * ------------------
 */

int main(int argc, char *argv[]) {
  
  int x = 0;
  int errcode = 0;
  long line_num = 0;
  
  const char *pMode = NULL;
  const char *pOutPath = NULL;
  const char *pMeshPath = NULL;
  
  int dconv = 0;
  FILE *pIn = NULL;
  SNSOURCE *pSrc = NULL;
  SPH_IMAGE_WRITER *pw = NULL;
  
  int32_t i = 0;
  int32_t y = 0;
  uint32_t *ps = NULL;
  
  VERTEX *pva = NULL;
  
  /* Get module name */
  pModule = NULL;
  if ((argc > 0) && (argv != NULL)) {
    pModule = argv[0];
  }
  if (pModule == NULL) {
    pModule = "lilacme2png";
  }
  
  /* Check argv */
  if (argc > 0) {
    if (argv == NULL) {
      raiseErr(__LINE__);
    }
    for(x = 0; x < argc; x++) {
      if (argv[x] == NULL) {
        raiseErr(__LINE__);
      }
    }
  }
  
  /* Check number of parameters */
  if ((argc != 5) && (argc != 6)) {
    fprintf(stderr, "%s: Wrong number of arguments!\n", pModule);
    raiseErr(__LINE__);
  }
  
  /* Get the core program arguments */
  pMode     = argv[1];
  pOutPath  = argv[2];
  pMeshPath = argv[3];
  
  /* Parse the mode and set the state variables and dconv */
  if (strcmp(pMode, "vector") == 0) {
    m_inter = INTER_VECTOR;
    m_vmode = VMODE_3D;
    dconv = SPH_IMAGE_DOWN_RGB;
    
  } else if (strcmp(pMode, "scalar-x") == 0) {
    m_inter = INTER_SCALAR;
    m_vmode = VMODE_X;
    dconv = SPH_IMAGE_DOWN_GRAY;
    
  } else if (strcmp(pMode, "scalar-y") == 0) {
    m_inter = INTER_SCALAR;
    m_vmode = VMODE_Y;
    dconv = SPH_IMAGE_DOWN_GRAY;
    
  } else {
    fprintf(stderr, "%s: Unrecognized mode '%s'!\n", pModule, pMode);
    raiseErr(__LINE__);
  }
  
  /* Open the mesh file as a Shastina source and assign ownership of the
   * file handle to the Shastina source object */
  pIn = fopen(pMeshPath, "rb");
  if (pIn != NULL) {
    pSrc = snsource_file(pIn, 1);
    pIn = NULL;
    
  } else {
    fprintf(stderr, "%s: Can't open mesh file!\n", pModule);
    raiseErr(__LINE__);
  }

  /* Parse the input file and build the mesh representation */
  pMesh = lilac_mesh_new(pSrc, &errcode, &line_num);
  if (pMesh == NULL) {
    if (line_num > 0) {
      fprintf(stderr, "%s: Mesh error: [line %ld] %s!\n",
                pModule, line_num, lilac_mesh_errstr(errcode));
    } else {
      fprintf(stderr, "%s: Mesh error: %s!\n",
                pModule, lilac_mesh_errstr(errcode));
    }
    raiseErr(__LINE__);
  }
  
  /* Consume the rest of input, making sure nothing remains in file */
  if (snsource_consume(pSrc) <= 0) {
    fprintf(stderr, "%s: Failed to consume mesh input after |;\n", 
              pModule);
    raiseErr(__LINE__);
  }
  
  /* Release the Shastina source, as well as any file handle owned by
   * the source */
  snsource_free(pSrc);
  pSrc = NULL;
  
  /* Initialize graphics buffer according to the last one or two
   * parameters */
  if (argc == 5) {
    /* We were passed a path to a mask PNG file */
    initBufMask(argv[4]);
    
  } else if (argc == 6) {
    /* We were passed two integer dimensions */
    initBufDim(parseInt32Arg(argv[4]), parseInt32Arg(argv[5]));
    
  } else {
    raiseErr(__LINE__);
  }
  
  /* Allocate a vertex array with one vertex per vertex in the lilac
   * mesh; leave as NULL if no points */
  if (pMesh->point_count > 0) {
    pva = (VERTEX *) calloc(
                      (size_t) pMesh->point_count, sizeof(VERTEX));
    if (pva == NULL) {
      fprintf(stderr, "%s: Memory allocation failed!\n", pModule);
      raiseErr(__LINE__);
    }
  
  } else {
    pva = NULL;
  }

  /* Get a vertex conversion for each lilac mesh vertex */
  for(i = 0; i < pMesh->point_count; i++) {
    convertVertex(&(pva[i]), &((pMesh->pPoints)[i]));
  }

  /* Render each triangle in the mesh, using the converted vertex
   * buffer */
  for(i = 0; i < pMesh->tri_count; i++) {
    renderTri(
      &(pva[(pMesh->pTris)[(i * 3)    ]]),
      &(pva[(pMesh->pTris)[(i * 3) + 1]]),
      &(pva[(pMesh->pTris)[(i * 3) + 2]])
    );
  }
  
  /* Release vertex array if allocated */
  if (pva != NULL) {
    free(pva);
    pva = NULL;
  }
  
  /* Release the mesh object */
  lilac_mesh_free(pMesh);
  pMesh = NULL;
  
  /* @@TODO: handle pixels that weren't written yet */
  
  /* Allocate an image writer for writing the image buffer to output */
  pw = sph_image_writer_newFromPath(
          pOutPath, m_w, m_h, dconv, 0, &errcode);
  if (pw == NULL) {
    fprintf(stderr, "%s: Failed to open PNG output: %s!\n",
            pModule, sph_image_errorString(errcode));
    raiseErr(__LINE__);
  }
  
  /* Transfer each scanline to output */
  ps = pBuf;
  for(y = 0; y < m_h; y++) {
    /* Copy scanline into output buffer */
    memcpy(
      sph_image_writer_ptr(pw),
      ps,
      ((size_t) m_w) * sizeof(uint32_t));
    
    /* Advance scanline pointer */
    ps += m_w;
    
    /* Write to output */
    sph_image_writer_write(pw);
  }
  
  /* Close image writer */
  sph_image_writer_close(pw);
  pw = NULL;
  
  /* If we got here, return successfully */
  return 0;
}
