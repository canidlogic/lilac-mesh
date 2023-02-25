#ifndef LILAC_MESH_H_INCLUDED
#define LILAC_MESH_H_INCLUDED

/*
 * lilac_mesh.h
 * ============
 * 
 * Lilac module for parsing a Shastina mesh file into memory.
 * 
 * This module must be compiled together with the Shastina library.
 */

/*
 * Imports
 * -------
 */

#include <stddef.h>
#include <stdint.h>
#include "shastina.h"

/*
 * Error codes
 * -----------
 * 
 * Negative error codes are Shastina error codes.
 * 
 * Zero means no error, and is defined here as LILAC_MESH_ERR_OK.
 * 
 * Error codes greater than zero mean a problem specific to the Lilac
 * mesh module.
 * 
 * All error codes, including Shastina error codes, can be converted
 * into error message strings using lilac_mesh_errstr().
 */

#define LILAC_MESH_ERR_OK     (0)   /* No error */
#define LILAC_MESH_ERR_REM    (1)   /* Elements remain on stack */
#define LILAC_MESH_ERR_PUNDEF (2)   /* Point left undefined */
#define LILAC_MESH_ERR_TUNDEF (3)   /* Triangle left undefined */
#define LILAC_MESH_ERR_ORPHAN (4)   /* Orphan points remain */
#define LILAC_MESH_ERR_ETYPE  (5)   /* Unsupported entity type */
#define LILAC_MESH_ERR_NUMBER (6)   /* Invalid numeric literal */
#define LILAC_MESH_ERR_OVERFL (7)   /* Stack overflow */
#define LILAC_MESH_ERR_BADOP  (8)   /* Unknown operation */
#define LILAC_MESH_ERR_UNDERF (9)   /* Stack underflow */
#define LILAC_MESH_ERR_NOSIG  (10)  /* Could not read signature */
#define LILAC_MESH_ERR_SIGVER (11)  /* Unsupported signature version */
#define LILAC_MESH_ERR_NODIM  (12)  /* Could not read dimensions */
#define LILAC_MESH_ERR_BADDIM (13)  /* Invalid dimension command */
#define LILAC_MESH_ERR_DIMVAL (14)  /* Bad dimension value */
#define LILAC_MESH_ERR_PCOUNT (15)  /* Invalid point count */
#define LILAC_MESH_ERR_TCOUNT (16)  /* Invalid triangle count */
#define LILAC_MESH_ERR_NORMDA (17)  /* norma when normd is zero */
#define LILAC_MESH_ERR_NORM2P (18)  /* norma may not be 2*PI */
#define LILAC_MESH_ERR_PTOVER (19)  /* Too many points defined */
#define LILAC_MESH_ERR_PTREF  (20)  /* Vertex reference undefined */
#define LILAC_MESH_ERR_VXDUP  (21)  /* Duplicated vertex point */
#define LILAC_MESH_ERR_VXORD  (22)  /* First vertex must be least */
#define LILAC_MESH_ERR_ORIENT (23)  /* Triangle orientation is wrong */
#define LILAC_MESH_ERR_TRSORT (24)  /* Invalid triangle sorting */
#define LILAC_MESH_ERR_DUPEDG (25)  /* Duplicated directed edge */
#define LILAC_MESH_ERR_TROVER (26)  /* Too many triangles defined */

/*
 * Constants
 * ---------
 */

/*
 * The maximum integer value allowed for encoded coordinates.
 * 
 * This must be in unsigned 16-bit range.
 */
#define LILAC_MESH_MAX_C (16384)

/*
 * The maximum number of points that may be in a mesh.
 * 
 * This must be in unsigned 16-bit range.  It must also not exceed the
 * value of LILAC_MESH_MAX_C.
 * 
 * To check for unique edges, a bitmap is constructed that has as many
 * bits as this constant value squared, so be careful not to set this
 * too high.
 */
#define LILAC_MESH_MAX_POINTS (1024)

/*
 * The maximum number of triangles that may be in a mesh.
 * 
 * It must not exceed the value of LILAC_MESH_MAX_C.
 */
#define LILAC_MESH_MAX_TRIS (1024)

/*
 * Type declarations
 * -----------------
 */

/*
 * Structure representing a point within a Lilac mesh.
 */
typedef struct {
  
  /*
   * Normal direction away from viewer.
   * 
   * A value of zero means that the normal is directly facing the
   * viewer.  A value of LILAC_MESH_MAX_C means that the normal is at
   * a 90-degree angle away from the viewer.  Any value between those
   * two extremes is also allowed.
   */
  uint16_t normd;
  
  /*
   * Normal direction angle.
   * 
   * This angle applies to the normal when it is projected into the XY
   * plane, where the X axis moves to the right and the Y axis moves
   * UPWARD.
   * 
   * If the normd field is zero, then this field must be zero, too.
   * This is because when the normal is pointing directly at the viewer,
   * it becomes a zero-magnitude vector when projected into the XY
   * plane, and therefore doesn't have any angle.
   * 
   * A value of zero means an angle of zero radians, which points
   * directly along the X axis.
   * 
   * A value of (LILAC_MESH_MAX_C / 4) means an angle of PI/2 radians,
   * which points directly along the (upward!) Y axis.
   * 
   * A value of (LILAC_MESH_MAX_C / 2) means an angle of PI radians,
   * which points down the negative X axis.
   * 
   * The maximum value is **one less** than LILAC_MESH_MAX_C.  This is
   * because LILAC_MESH_MAX_C would be an equivalent angle to zero.
   */
  uint16_t norma;
  
  /*
   * Normalized X coordinate relative to a tracing image.
   * 
   * A value of zero means the left-most column of pixels in the image.
   * A value of LILAC_MESH_MAX_C means the right-most column of pixels
   * in the image.  All values between those two extremes are also
   * allowed.
   */
  uint16_t x;
  
  /*
   * Normalized Y coordinate relative to a tracing image.
   * 
   * Note that this coordinate is oriented with the Y axis pointing
   * UPWARDS, which is the opposite of the usual top-down orientation of
   * most raster images!
   * 
   * A value of zero means the bottom row of pixels in the image.  A
   * value of LILAC_MESH_MAX_C means the top row of pixels in the image.
   * All values between those two extremes are also allowed.
   */
  uint16_t y;
  
} LILAC_MESH_POINT;

/*
 * Structure for holding a Lilac mesh in memory.
 */
typedef struct {
  
  /*
   * Pointer to an array of mesh points.
   * 
   * See the LILAC_MESH_POINT structure for the definition of each point
   * structure.
   * 
   * The point_count field contains the total number of array elements.
   * If point_count is zero, then this pointer must be NULL.  Otherwise,
   * this pointer must be non-NULL.
   * 
   * If non-NULL, the memory indicated by this pointer is dynamically
   * allocated and owned by the mesh structure.
   * 
   * Each point in this array must be referenced from at least one
   * triangle in the triangle list.
   */
  LILAC_MESH_POINT *pPoints;
  
  /*
   * Pointer to the triangle list.
   * 
   * Each triangle has exactly three elements in this array.  Each array
   * element is the (zero-based) index of a point structure in the
   * pPoints array.  Therefore, each triangle is a reference to three
   * point structures, defining the boundaries of the triangle.
   * 
   * The tri_count field contains the total number of triangles.  The
   * length of the triangle list is therefore THREE TIMES the value of
   * tri_count, because each triangle has three elements.
   * 
   * If tri_count is zero, then this pointer must be NULL.  Otherwise,
   * this pointer must be non-NULL.
   * 
   * If non-NULL, the memory indicated by this pointer is dynamically
   * allocated and owned by the mesh structure.
   * 
   * Within each triangle, all three vertices must be to different
   * points, and the first vertex must be the vertex with the lowest
   * index in the point array.  The second and third vertices must be
   * ordered such that the edges go counter-clockwise around the
   * triangle.  The three points of the triangle are not allowed to be
   * colinear.
   * 
   * Across all triangles, the DIRECTED edges of each triangle must be
   * unique.  An edge between two points P1 and P2 is allowed to be used
   * in two different triangles only if the first triangle has the edge
   * going from P1 to P2 and the second triangle has the edge going from
   * P2 to P1.
   * 
   * The triangle list must be sorted first in ascending order of the
   * numeric value of the first vertex index and second in ascending
   * order of the numeric value of the second vertex index.  Since no
   * two triangles are allowed to have the same directed edge, there is
   * no need to reference the third vertex during sorting.
   */
  uint16_t *pTris;
  
  /*
   * The total number of point structures in the pPoints array.
   * 
   * This value may be zero.  Its maximum value is the constant
   * LILAC_MESH_MAX_POINTS.
   */
  int32_t point_count;
  
  /*
   * The total number of triangles in the pTris list.
   * 
   * This counts triangles, not individual array elements!
   * 
   * This value may be zero.  Its maximum value is the constant
   * LILAC_MESH_MAX_TRIS.
   */
  int32_t tri_count;
  
} LILAC_MESH;

/*
 * Public functions
 * ----------------
 */

/*
 * Given a Shastina source to read the Lilac mesh definition from,
 * interpret the mesh file and create an in-memory representation of
 * the mesh.
 * 
 * pIn must be a Shastina input source that represents the Lilac mesh
 * file to read from.  It will NOT be freed by this function; the source
 * remains owned by the caller.  This function also will NOT consume the
 * rest of input after the |; marker -- the caller may do this.
 * 
 * pErrCode, if not NULL, points to a variable to receive the error code
 * status upon return.  If the function is successful, a value of
 * LILAC_MESH_ERR_OK (zero) will be written into the variable.
 * Otherwise, the value is an error code.  See the "Error codes" section
 * earlier in this header for definitions.  You can use the function
 * lilac_mesh_errstr() to get an error message from an error code.
 * 
 * pLine, if not NULL, points to a variable to receive a line number
 * upon return.  If the function is successful, a value of zero will be
 * written into the variable.  If the function fails AND there is a
 * valid line number in the source file associated with the error, then
 * the line number will be written into this variable.  Otherwise, a
 * value of zero will be written into this variable.
 * 
 * pErrCode and/or pLine may be set to NULL if you do not require such
 * information.
 * 
 * Upon success, the return value is a dynamically allocated Lilac Mesh
 * object.  This should eventually be freed with lilac_mesh_free().  See
 * the structure definition earlier in this header file for details.  If
 * pErrCode was not NULL, a value of LILAC_MESH_ERR_OK (0) will be
 * written.  If pLine was not NULL, a value of zero will be written.
 * 
 * Upon failure, the return value is NULL.  If pErrCode was not NULL, it
 * will contain an error code.  If pLine was not NULL, it will contain
 * either a line number for the error, or zero.
 * 
 * For the specific format of the Lilac mesh file, see MeshFormat.md in
 * the documentation folder.
 * 
 * Parameters:
 * 
 *   pIn - the Shastina source to read the Lilac mesh file from
 * 
 *   pErrCode - pointer to variable to receive the error code status of
 *   the operation, or NULL
 * 
 *   pLine - pointer to variable to receive a line number, or NULL
 * 
 * Return:
 * 
 *   a new Lilac mesh object or NULL if failure
 */
LILAC_MESH *lilac_mesh_new(SNSOURCE *pIn, int *pErrCode, long *pLine);

/*
 * Free an allocated Lilac mesh object.
 * 
 * If NULL is passed, the call is ignored.
 * 
 * Parameters:
 * 
 *   pLm - the mesh object to free, or NULL
 */
void lilac_mesh_free(LILAC_MESH *pLm);

/*
 * Given an error code from Lilac mesh or Shastina, return an error
 * message corresponding to that code.
 * 
 * The string has the first letter capitalized, but no punctuation or
 * line break at the end.
 * 
 * If the given code is not recognized, "Unknown error" is returned.  If
 * the given code is LILAC_MESH_ERR_OK (0), "No error" is returned.
 * 
 * The returned string is statically allocated.  The client should not
 * attempt to free it.
 * 
 * Parameters:
 * 
 *   code - the error code
 * 
 * Return:
 * 
 *   an error message
 */
const char *lilac_mesh_errstr(int code);

#endif
