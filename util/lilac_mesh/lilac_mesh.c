/*
 * lilac_mesh.c
 * ============
 * 
 * Implementation of lilac_mesh.h
 * 
 * See the header for further information.
 */

#include "lilac_mesh.h"

#include <limits.h>
#include <stdlib.h>
#include <string.h>

/*
 * Constants
 * ---------
 */

/*
 * The maximum height of the Shastina interpreter stack.
 */
#define MAX_SN_STACK (16)

/*
 * Type declarations
 * -----------------
 */

/*
 * Structure storing usage bitmaps.
 * 
 * Initialize with usage_map_init().  Reset with usage_map_reset()
 * before the structure goes out of scope to avoid a memory leak.
 * 
 * Access the structure through the usage_map_ functions.
 */
typedef struct {
  
  /*
   * Pointer to a bitmap that keeps track of which points have been
   * used within triangles.
   * 
   * The most significant bit of the first unsigned 32-bit integer
   * represents point zero.  Bits that are zero mean the corresponding
   * point has not been referenced from any triangle yet, while bits
   * that are one mean the corresponding point has been referenced from
   * at least one triangle.
   * 
   * The size **IN BITS** of this array is the number of points, rounded
   * up to the nearest 32-bit boundary.  This array is dynamically
   * allocated.  The pointer is NULL only if the point count is zero.
   */
  uint32_t *pPointUse;
  
  /*
   * Pointer to a 2D bitmap that keeps track of which directed edges
   * have been used within triangles.
   * 
   * The total length **IN BITS** of this bitmap is the total number of
   * points squared, rounded up to the nearest 32-bit boundary.  The
   * most significant bit of the first unsigned 32-bit integer is the
   * first bit in the 2D bitmap.
   * 
   * A directed edge of a triangle going from a point with index i1 to
   * a point with index i2 corresponds to a bit in this bitmap having
   * the zero-based offset ((i1 * point_count) + i2).  Bits that are
   * zero mean the corresponding directed edge has not yet been used in
   * a triangle, while bits that are one mean the corresponding directed
   * edge has been used in a triangle already.
   *  
   * This pointer is only NULL if the point count is zero.
   */
  uint32_t *pEdgeUse;
  
  /*
   * The total number of points tracked by this usage map.
   */
  int32_t point_count;
  
} USAGE_MAP;

/*
 * Local functions
 * ---------------
 */

/* Prototypes */
static void usage_map_init(USAGE_MAP *pM);
static void usage_map_reset(USAGE_MAP *pM);
static void usage_map_dim(USAGE_MAP *pM, int32_t point_count);
static void usage_map_point(USAGE_MAP *pM, int32_t i);
static int usage_map_edge(USAGE_MAP *pM, int32_t i1, int32_t i2);
static int usage_map_orphan(USAGE_MAP *pM);

static int32_t parseNumber(const char *pstr);

static int op_p(
    uint16_t     normd,
    uint16_t     norma,
    uint16_t     x,
    uint16_t     y,
    LILAC_MESH * pM,
    int32_t    * pPtsWritten,
    int        * pErrCode);

static int op_t(
    uint16_t     v1,
    uint16_t     v2,
    uint16_t     v3,
    LILAC_MESH * pM,
    int32_t      ptsWritten,
    int32_t    * pTriWritten,
    USAGE_MAP  * pUm,
    int        * pErrCode);

static int readHeader(
    SNPARSER * pSn,
    SNSOURCE * pIn,
    int32_t  * pPoints,
    int32_t  * pTris,
    int      * pErrCode,
    long     * pLine);

/*
 * Initialize a usage map structure.
 * 
 * This clears the structure to zero, and then writes a point count of
 * zero with NULL pointers to the bitmap arrays.
 * 
 * Only use this on uninitialized usage map structures.  Using this
 * function on a usage map that is already initialized may cause a
 * memory leak.
 * 
 * Before the usage map structure is released, call usage_map_reset() to
 * avoid memory leaks.
 * 
 * Parameters:
 * 
 *   pM - the uninitialized usage map structure
 */
static void usage_map_init(USAGE_MAP *pM) {
  
  /* Check parameter */
  if (pM == NULL) {
    abort();
  }
  
  /* Zero out structure */
  memset(pM, 0, sizeof(USAGE_MAP));
  
  /* Initialize */
  pM->pPointUse = NULL;
  pM->pEdgeUse = NULL;
  pM->point_count = 0;
}

/*
 * Reset a usage map structure to its initial state.
 * 
 * The given usage map structure must already have been initialized with
 * usage_map_init().  This function will free the arrays if allocated
 * and change the point count in the structure to zero.
 * 
 * You must call this function on initialized usage maps before they are
 * released to avoid memory leaks.
 * 
 * Parameters:
 * 
 *   pM - the initialized usage map structure to reset
 */
static void usage_map_reset(USAGE_MAP *pM) {
  
  /* Check parameter */
  if (pM == NULL) {
    abort();
  }
  
  /* Free arrays if allocated */
  if (pM->pPointUse != NULL) {
    free(pM->pPointUse);
    pM->pPointUse = NULL;
  }
  
  if (pM->pEdgeUse != NULL) {
    free(pM->pEdgeUse);
    pM->pEdgeUse = NULL;
  }
  
  /* Reset point count to zero */
  pM->point_count = 0;
}

/*
 * Prepare a usage map structure for use with a given number of points.
 * 
 * The given usage map structure must already have been initialized with
 * usage_map_init().  This function will automatically call the function
 * usage_map_reset() before updating the structure.
 * 
 * point_count must be in range [0, LILAC_MESH_MAX_POINTS].  All bits in
 * the bitmaps are initialized to clear.
 * 
 * Parameters:
 * 
 *   pM - the initialized usage map structure to dimension
 * 
 *   point_count - the number of points to track
 */
static void usage_map_dim(USAGE_MAP *pM, int32_t point_count) {
  
  int32_t count = 0;
  int32_t mcount = 0;

  /* Check parameters */
  if ((pM == NULL) ||
        (point_count < 0) || (point_count > LILAC_MESH_MAX_POINTS)) {
    abort();
  }
  
  /* Begin by resetting structure */
  usage_map_reset(pM);
  
  /* Only proceed if at least one point requested */
  if (point_count > 0) {
  
    /* Compute number of 32-bit blocks needed for point usage bitmap */
    count = point_count / 32;
    if (point_count % 32) {
      count++;
    }
  
    /* Allocate and zero out point-use bitmap */
    pM->pPointUse = (uint32_t *) calloc(count, sizeof(uint32_t));
    if (pM->pPointUse == NULL) {
      abort();
    }
    
    /* Compute number of 32-bit blocks needed for edge usage bitmap */
    mcount = point_count * point_count;
    count = mcount / 32;
    if (mcount % 32) {
      count++;
    }
    
    /* Allocate and zero out edge-use bitmap */
    pM->pEdgeUse = (uint32_t *) calloc(count, sizeof(uint32_t));
    if (pM->pEdgeUse == NULL) {
      abort();
    }
    
    /* Write the point count */
    pM->point_count = point_count;
  }
}

/*
 * Report in the usage map that a specific point index has been
 * referenced from a triangle.
 * 
 * If the corresponding bit for the point is already set, this function
 * has no further effect.
 * 
 * The given index must be in range [0, point_count) with the
 * point_count value established by a call to usage_map_dim().
 * 
 * Parameters:
 * 
 *   pM - the initialized usage map structure
 * 
 *   i - the point index
 */
static void usage_map_point(USAGE_MAP *pM, int32_t i) {
  
  int32_t offs = 0;
  int shift = 0;
  uint32_t mask = 0;
  
  /* Check parameters */
  if ((pM == NULL) || (i < 0) || (i >= pM->point_count)) {
    abort();
  }
  
  /* Compute offset and shift of the corresponding bit */
  offs = i / 32;
  shift = (int) (31 - (i % 32));
  
  /* Compute mask */
  mask = (uint32_t) (UINT32_C(1) << shift);
  
  /* Set the appropriate bit */
  (pM->pPointUse)[offs] |= mask;
}

/*
 * Report in the usage map that a specific directed edge has been used
 * in a triangle and check that it hasn't been used before.
 * 
 * i1 and i2 must both be in range [0, point_count) with the point_count
 * value established by a call to usage_map_dim().  The order of i1 and
 * i2 is significant because the edges are directed.  A fault occurs if
 * i1 and i2 are equal.
 * 
 * If the directed edge has not been marked for use yet, it is marked
 * for use and a non-zero value is returned.  If the directed edge has
 * already been marked for use, a zero value is returned.
 * 
 * Parameters:
 * 
 *   pM - the initialized usage map structure
 * 
 *   i1 - the first "from" point index of the edge
 * 
 *   i2 - the second "to" point index of the edge
 * 
 * Return:
 * 
 *   non-zero if successful, zero if directed edge has already been used
 */
static int usage_map_edge(USAGE_MAP *pM, int32_t i1, int32_t i2) {
  
  int status = 1;
  
  int32_t ix = 0;
  int32_t offs = 0;
  int shift = 0;
  uint32_t mask = 0;

  /* Check parameters */
  if ((pM == NULL) ||
      (i1 < 0) || (i1 >= pM->point_count) ||
      (i2 < 0) || (i2 >= pM->point_count)) {
    abort();
  }

  /* Compute the 1D index of the bit */
  ix = (i1 * pM->point_count) + i2;
  
  /* Compute offset and shift of the corresponding bit */
  offs = ix / 32;
  shift = (int) (31 - (ix % 32));
  
  /* Compute mask */
  mask = (uint32_t) (UINT32_C(1) << shift);
  
  /* Check whether bit is set or not */
  if ((pM->pEdgeUse)[offs] & mask) {
    /* Already set, so fail */
    status = 0;
    
  } else {
    /* Not already set, so set it */
    (pM->pEdgeUse)[offs] |= mask;
  }
  
  /* Return status */
  return status;
}

/*
 * Check for orphaned points in the usage map.
 * 
 * Orphaned points are point index values in range [0, point_count) that
 * have not been marked by a call to usage_map_point() yet.  The
 * point_count value is established by a call to usage_map_dim().
 * 
 * If there are no orphan points, zero is returned.  Otherwise, the
 * return is non-zero.
 * 
 * Parameters:
 * 
 *   pM - the initialized usage map structure
 * 
 * Return:
 * 
 *   non-zero if orphan points remain, zero if no orphan points  
 */
static int usage_map_orphan(USAGE_MAP *pM) {
  
  int result = 0;
  int32_t full_count = 0;
  int32_t i = 0;
  int extra_bits = 0;
  uint32_t mask = 0;
  
  /* Check parameter */
  if (pM == NULL) {
    abort();
  }
  
  /* Only proceed if at least one point; else, just return result of
   * zero */
  if (pM->point_count > 0) {
    /* Compute number of fully-used 32-bit blocks */
    full_count = pM->point_count / 32;
    
    /* Compute number of extra bits in overflow block (if any) */
    extra_bits = (int) (pM->point_count % 32);
    
    /* If at least one extra bit, compute OR mask for setting all the
     * unused bits in the overflow block */
    if (extra_bits > 0) {
      mask = (UINT32_C(1) << (32 - extra_bits)) - 1;
    }
    
    /* All fully-used 32-bit blocks must be all set */
    for(i = 0; i < full_count; i++) {
      if ((~((pM->pPointUse)[i])) != 0) {
        result = 1;
        break;
      }
    }
    
    /* If we didn't find any orphans in the fully-used blocks and there
     * is an overflow block, it should be all set after adding in the
     * OR mask we computed above */
    if ((!result) && (extra_bits > 0)) {
      if ((~(((pM->pPointUse)[full_count]) | mask)) != 0) {
        result = 1;
      }
    }
  }
  
  /* Return result */
  return result;
}

/*
 * Parse a numeric entity string from the Shastina file.
 * 
 * If successful, return value is an integer in [0, LILAC_MESH_MAX_C].
 * Otherwise, return value is -1.
 * 
 * Parameters:
 * 
 *   pstr - pointer to the string to parse
 * 
 * Return:
 * 
 *   the parsed numeric value or -1
 */
static int32_t parseNumber(const char *pstr) {
  
  int32_t result = 0;
  int c = 0;
  
  /* Check parameter */
  if (pstr == NULL) {
    abort();
  }
  
  /* Make sure at least one character */
  if (pstr[0] == 0) {
    result = -1;
  }
  
  /* Parse the numeric value */
  if (result >= 0) {
    for( ; *pstr != 0; pstr++) {
      /* Get current character */
      c = *pstr;
      
      /* Check that character is decimal digit */
      if ((c < '0') || (c > '9')) {
        result = -1;
        break;
      }
      
      /* Get numeric value of current character */
      c = c - '0';
      
      /* Add into current result */
      result = (result * 10) + c;
      
      /* Check for overflow */
      if (result > LILAC_MESH_MAX_C) {
        result = -1;
        break;
      }
    }
  }
  
  /* Return result or -1 */
  return result;
}

/*
 * Perform the point operation.
 * 
 * normd, norma, x, and y are the parameters passed to this function
 * from the interpreter stack.  All must be in [0, LILAC_MESH_MAX_C] or
 * a fault occurs.  This function will perform further checks if needed
 * and report them as errors.
 * 
 * pM is the mesh object to update, pPtsWritten must point to a variable
 * that keeps track of how many points have been written into the mesh
 * object so far.
 * 
 * pErrCode must point to a variable to receive an error code if there
 * is a failure.  Note that this function does not have a way of setting
 * the line number of an error, so the caller is expected to do that in
 * case of error.
 * 
 * Parameters:
 * 
 *   normd - the normal direction from viewer
 * 
 *   norma - the normal angle
 * 
 *   x - the X coordinate of the point
 * 
 *   y - the Y coordinate of the point
 * 
 *   pM - pointer to the mesh object to update
 * 
 *   pPtsWritten - pointer to variable tracking number of points written
 * 
 *   pErrCode - pointer to variable to receive error code
 * 
 * Return:
 * 
 *   non-zero if successful, zero if error
 */
static int op_p(
    uint16_t     normd,
    uint16_t     norma,
    uint16_t     x,
    uint16_t     y,
    LILAC_MESH * pM,
    int32_t    * pPtsWritten,
    int        * pErrCode) {
  
  int status = 1;
  LILAC_MESH_POINT *pLMP = NULL;
  
  /* Check parameters */
  if ((normd > LILAC_MESH_MAX_C) ||
      (norma > LILAC_MESH_MAX_C) ||
      (x > LILAC_MESH_MAX_C) ||
      (y > LILAC_MESH_MAX_C) ||
      (pM == NULL) || (pPtsWritten == NULL) ||
      (pErrCode == NULL)) {
    abort();
  }
  
  /* If normd is zero, norma must also be zero */
  if (normd == 0) {
    if (norma != 0) {
      status = 0;
      *pErrCode = LILAC_MESH_ERR_NORMDA;
    }
  }
  
  /* norma may not be equivalent to 2*PI radians */
  if (status && (norma >= LILAC_MESH_MAX_C)) {
    status = 0;
    *pErrCode = LILAC_MESH_ERR_NORM2P;
  }
  
  /* Make sure we have room to write another point */
  if (status && (*pPtsWritten >= pM->point_count)) {
    status = 0;
    *pErrCode = LILAC_MESH_ERR_PTOVER;
  }
  
  /* Get a reference to the next point structure, copy in the values,
   * and increment the written point count */
  if (status) {
    pLMP = &((pM->pPoints)[*pPtsWritten]);
    pLMP->normd = normd;
    pLMP->norma = norma;
    pLMP->x = x;
    pLMP->y = y;
    (*pPtsWritten)++;
  }
  
  /* Return status */
  return status;
}

/*
 * Perform the triangle operation.
 * 
 * v1, v2, and v3 are the parameters passed to this function from the
 * interpreter stack.  All must be in the range [0, LILAC_MESH_MAX_C] or
 * a fault occurs.  This function will perform further checks if needed
 * and report them as errors.
 * 
 * pM is the mesh object to update, pTriWritten must point to a variable
 * that keeps track of how many triangles have been written into the
 * mesh object so far, and pUm is a pointer to the usage map structure
 * to update.
 * 
 * pErrCode must point to a variable to receive an error code if there
 * is a failure.  Note that this function does not have a way of setting
 * the line number of an error, so the caller is expected to do that in
 * case of error.
 * 
 * If an error occurs, the usage map may have already been updated, or
 * partially updated, even though the changes have not been made to the
 * mesh object.
 * 
 * Parameters:
 * 
 *   v1 - index of the first point vertex
 * 
 *   v2 - index of the second point vertex
 * 
 *   v3 - index of the third point vertex
 * 
 *   pM - pointer to the mesh object to update
 * 
 *   ptsWritten - the number of points that have been written so far
 * 
 *   pTriWritten - pointer to variable tracking number of triangles
 *   written
 * 
 *   pUm - pointer to the usage map structure
 * 
 *   pErrCode - pointer to variable to receive error code
 * 
 * Return:
 * 
 *   non-zero if successful, zero if error
 */
static int op_t(
    uint16_t     v1,
    uint16_t     v2,
    uint16_t     v3,
    LILAC_MESH * pM,
    int32_t      ptsWritten,
    int32_t    * pTriWritten,
    USAGE_MAP  * pUm,
    int        * pErrCode) {
  
  int status = 1;
  
  LILAC_MESH_POINT *pA = NULL;
  LILAC_MESH_POINT *pB = NULL;
  LILAC_MESH_POINT *pC = NULL;
  
  uint16_t *pt = NULL;
  
  double v1x = 0.0;
  double v1y = 0.0;
  double v2x = 0.0;
  double v2y = 0.0;
  double v3x = 0.0;
  double v3y = 0.0;
  double k = 0.0;

  /* Check parameters */
  if ((v1 > LILAC_MESH_MAX_C) ||
      (v2 > LILAC_MESH_MAX_C) ||
      (v3 > LILAC_MESH_MAX_C) ||
      (ptsWritten < 0) || (ptsWritten > LILAC_MESH_MAX_POINTS) ||
      (pM == NULL) || (pTriWritten == NULL) ||
      (pUm == NULL) || (pErrCode == NULL)) {
    abort();
  }

  /* Verify that all vertex points have been defined already */
  if ((v1 >= ptsWritten) || (v2 >= ptsWritten) || (v3 >= ptsWritten)) {
    status = 0;
    *pErrCode = LILAC_MESH_ERR_PTREF;
  }
  
  /* Verify that no two points are the same */
  if (status) {
    if ((v1 == v2) || (v2 == v3) || (v1 == v3)) {
      status = 0;
      *pErrCode = LILAC_MESH_ERR_VXDUP;
    }
  }
  
  /* Verify that the first vertex has the lowest numeric value */
  if (status) {
    if ((v2 < v1) || (v3 < v1)) {
      status = 0;
      *pErrCode = LILAC_MESH_ERR_VXORD;
    }
  }
  
  /* Verify that vertices are in counter-clockwise order */
  if (status) {
    /* Get references to each point structure */
    pA = &((pM->pPoints)[v1]);
    pB = &((pM->pPoints)[v2]);
    pC = &((pM->pPoints)[v3]);
    
    /* Get vertex coordinates in normalized floating-point space */
    v1x = ((double) pA->x) / ((double) LILAC_MESH_MAX_C);
    v1y = ((double) pA->y) / ((double) LILAC_MESH_MAX_C);
    
    v2x = ((double) pB->x) / ((double) LILAC_MESH_MAX_C);
    v2y = ((double) pB->y) / ((double) LILAC_MESH_MAX_C);
    
    v3x = ((double) pC->x) / ((double) LILAC_MESH_MAX_C);
    v3y = ((double) pC->y) / ((double) LILAC_MESH_MAX_C);
    
    /* Compute the cross product (V2-V1)x(V3-V1) to make sure that the
     * Z-axis vector has a magnitude greater than zero, ensuring that
     * the points on the triangle are not colinear and that they are in
     * counter-clockwise order; since the Z coordinates of our 2D points
     * are all zero, the X-axis and Y-axis vectors of the cross product
     * will always have zero magnitude, so we just need to compute the
     * Z-axis vector, which is ((x2-x1)*(y3-y1) - (y2-y1)*(x3-x1)), and
     * make sure this is greater than zero */
    k = ((v2x - v1x) * (v3y - v1y)) - ((v2y - v1y) * (v3x - v1x));
    if (!(k > 0.0)) {
      status = 0;
      *pErrCode = LILAC_MESH_ERR_ORIENT;
    }
  }

  /* If this is not the first triangle, check that this triangle is
   * properly sorted relative to the previous triangle */
  if (status && (*pTriWritten > 0)) {
    /* Get reference to previous triangle vertices */
    pt = &((pM->pTris)[(*pTriWritten - 1) * 3]);
    
    /* Check ordering */
    if (pt[0] > v1) {
      status = 0;
      *pErrCode = LILAC_MESH_ERR_TRSORT;
    
    } else if (pt[0] == v1) {
      if (pt[1] >= v2) {
        status = 0;
        *pErrCode = LILAC_MESH_ERR_TRSORT;
      }
    }
  }
  
  /* Make sure we have room for another triangle */
  if (status && (*pTriWritten >= pM->tri_count)) {
    status = 0;
    *pErrCode = LILAC_MESH_ERR_TROVER;
  }

  /* Mark the directed edges and check that no directed edge already
   * used by another triangle */
  if (status) {
    if (!usage_map_edge(pUm, v1, v2)) {
      status = 0;
      *pErrCode = LILAC_MESH_ERR_DUPEDG;
    }
  }

  if (status) {
    if (!usage_map_edge(pUm, v2, v3)) {
      status = 0;
      *pErrCode = LILAC_MESH_ERR_DUPEDG;
    }
  }

  if (status) {
    if (!usage_map_edge(pUm, v3, v1)) {
      status = 0;
      *pErrCode = LILAC_MESH_ERR_DUPEDG;
    }
  }

  /* Mark the vertex points as referenced in the usage map */
  if (status) {
    usage_map_point(pUm, v1);
    usage_map_point(pUm, v2);
    usage_map_point(pUm, v3);
  }

  /* Finally, add the triangle to the triangle list and updated the
   * triangles written count */
  if (status) {
    pt = &((pM->pTris)[(*pTriWritten) * 3]);
    pt[0] = v1;
    pt[1] = v2;
    pt[2] = v3;
    (*pTriWritten)++;
  }
  
  /* Return status */
  return status;
}

/*
 * Read the header of the Shastina mesh file.
 * 
 * This reads the file type signature and the points and triangles
 * dimension metacommand.  If successful, the parser is ready to read
 * the first entity after the header, and *pPoints and *pTris are set to
 * the count of points and triangles read from the header, which are
 * validated to be in range [0, LILAC_MESH_MAX_POINTS] and the range
 * [0, LILAC_MESH_MAX_TRIS], respectively.
 * 
 * If failure, the error code and line number will be set appropriately.
 * Unlike the public function, these parameters are required for this
 * function.
 * 
 * Parameters:
 * 
 *   pSn - the Shastina parser
 * 
 *   pIn - the Shastina source to read from
 * 
 *   pPoints - pointer to receive the count of points if success
 * 
 *   pTris - pointer to receive the count of triangles if success
 * 
 *   pErrCode - pointer to variable to receive error code if failure
 * 
 *   pLine - pointer to variable to receive line number if failure
 * 
 * Return:
 * 
 *   non-zero if successful, zero if error
 */
static int readHeader(
    SNPARSER * pSn,
    SNSOURCE * pIn,
    int32_t  * pPoints,
    int32_t  * pTris,
    int      * pErrCode,
    long     * pLine) {
  
  int status = 1;
  int32_t i_pts = 0;
  int32_t i_tris = 0;
  SNENTITY ent;
  
  /* Initialize structures */
  memset(&ent, 0, sizeof(SNENTITY));
  
  /* Check parameters */
  if ((pSn == NULL) || (pIn == NULL) || (pPoints == NULL) ||
      (pTris == NULL) || (pErrCode == NULL) || (pLine == NULL)) {
    abort();
  }
  
  /* Read the required signature */
  snparser_read(pSn, &ent, pIn);
  if (ent.status < 0) {
    status = 0;
    *pErrCode = ent.status;
    *pLine = snparser_count(pSn);
  
  } else if (ent.status != SNENTITY_BEGIN_META) {
    status = 0;
    *pErrCode = LILAC_MESH_ERR_NOSIG;
    *pLine = 0;
  }
  
  if (status) {
    snparser_read(pSn, &ent, pIn);
    if (ent.status < 0) {
      status = 0;
      *pErrCode = ent.status;
      *pLine = snparser_count(pSn);
    
    } else if (ent.status != SNENTITY_META_TOKEN) {
      status = 0;
      *pErrCode = LILAC_MESH_ERR_NOSIG;
      *pLine = 0;
    }
    
    if (status && (strcmp(ent.pKey, "lilac-mesh") != 0)) {
      status = 0;
      *pErrCode = LILAC_MESH_ERR_NOSIG;
      *pLine = 0;
    }
  }
  
  if (status) {
    snparser_read(pSn, &ent, pIn);
    if (ent.status < 0) {
      status = 0;
      *pErrCode = ent.status;
      *pLine = snparser_count(pSn);
    
    } else if (ent.status != SNENTITY_END_META) {
      status = 0;
      *pErrCode = LILAC_MESH_ERR_SIGVER;
      *pLine = snparser_count(pSn);
    }
  }
  
  /* Read the dimension metacommand */
  if (status) {
    snparser_read(pSn, &ent, pIn);
    if (ent.status < 0) {
      status = 0;
      *pErrCode = ent.status;
      *pLine = snparser_count(pSn);
    
    } else if (ent.status != SNENTITY_BEGIN_META) {
      status = 0;
      *pErrCode = LILAC_MESH_ERR_NODIM;
      *pLine = 0;
    }
  }
  
  if (status) {
    snparser_read(pSn, &ent, pIn);
    if (ent.status < 0) {
      status = 0;
      *pErrCode = ent.status;
      *pLine = snparser_count(pSn);
    
    } else if (ent.status != SNENTITY_META_TOKEN) {
      status = 0;
      *pErrCode = LILAC_MESH_ERR_NODIM;
      *pLine = 0;
    }
    
    if (status && (strcmp(ent.pKey, "dim") != 0)) {
      status = 0;
      *pErrCode = LILAC_MESH_ERR_NODIM;
      *pLine = 0;
    }
  }
  
  if (status) {
    snparser_read(pSn, &ent, pIn);
    if (ent.status < 0) {
      status = 0;
      *pErrCode = ent.status;
      *pLine = snparser_count(pSn);
    
    } else if (ent.status != SNENTITY_META_TOKEN) {
      status = 0;
      *pErrCode = LILAC_MESH_ERR_BADDIM;
      *pLine = snparser_count(pSn);
    }
    
    if (status) {
      i_pts = parseNumber(ent.pKey);
      if (i_pts < 0) {
        status = 0;
        *pErrCode = LILAC_MESH_ERR_DIMVAL;
        *pLine = snparser_count(pSn);
      }
    }
  }
  
  if (status) {
    snparser_read(pSn, &ent, pIn);
    if (ent.status < 0) {
      status = 0;
      *pErrCode = ent.status;
      *pLine = snparser_count(pSn);
    
    } else if (ent.status != SNENTITY_META_TOKEN) {
      status = 0;
      *pErrCode = LILAC_MESH_ERR_BADDIM;
      *pLine = snparser_count(pSn);
    }
    
    if (status) {
      i_tris = parseNumber(ent.pKey);
      if (i_tris < 0) {
        status = 0;
        *pErrCode = LILAC_MESH_ERR_DIMVAL;
        *pLine = snparser_count(pSn);
      }
    }
  }
  
  if (status) {
    snparser_read(pSn, &ent, pIn);
    if (ent.status < 0) {
      status = 0;
      *pErrCode = ent.status;
      *pLine = snparser_count(pSn);
    
    } else if (ent.status != SNENTITY_END_META) {
      status = 0;
      *pErrCode = LILAC_MESH_ERR_BADDIM;
      *pLine = snparser_count(pSn);
    }
  }
  
  /* Validate ranges of dimensions that were read */
  if (status) {
    if ((i_pts < 0) || (i_pts > LILAC_MESH_MAX_POINTS)) {
      status = 0;
      *pErrCode = LILAC_MESH_ERR_PCOUNT;
      *pLine = 0;
    }
  }
  
  if (status) {
    if ((i_tris < 0) || (i_tris > LILAC_MESH_MAX_TRIS)) {
      status = 0;
      *pErrCode = LILAC_MESH_ERR_TCOUNT;
      *pLine = 0;
    }
  }
  
  /* If we got here successfully, store the read dimensions */
  if (status) {
    *pPoints = i_pts;
    *pTris = i_tris;
  }
  
  /* Adjust line count if error and out of range */
  if (!status) {
    if ((*pLine < 1) || (*pLine >= LONG_MAX)) {
      *pLine = 0;
    }
  }
  
  /* Return status */
  return status;
}

/*
 * Public function implementations
 * -------------------------------
 * 
 * See the header for specifications
 */

/*
 * lilac_mesh_new function.
 */
LILAC_MESH *lilac_mesh_new(SNSOURCE *pIn, int *pErrCode, long *pLine) {
  
  int status = 1;
  int i_dummy = 0;
  long l_dummy = 0;
  
  int32_t i = 0;
  
  int32_t point_count = 0;
  int32_t tri_count = 0;
  
  int32_t points_written = 0;
  int32_t tris_written = 0;
  
  uint16_t st[MAX_SN_STACK];
  int st_count = 0;
  
  SNPARSER *pSn = NULL;
  LILAC_MESH *pM = NULL;
  
  SNENTITY ent;
  USAGE_MAP um;
  
  /* Initialize structures and arrays */
  memset(&ent, 0, sizeof(SNENTITY));
  memset(st, 0, MAX_SN_STACK * sizeof(uint16_t));
  usage_map_init(&um);
  
  /* Check required parameter */
  if (pIn == NULL) {
    abort();
  }

  /* If optional parameter(s) not provided, redirect to dummy vars */
  if (pErrCode == NULL) {
    pErrCode = &i_dummy;
  }
  if (pLine == NULL) {
    pLine = &l_dummy;
  }
  
  /* Reset error and line codes */
  *pErrCode = LILAC_MESH_ERR_OK;
  *pLine = 0;
  
  /* Allocate a Shastina parser */
  pSn = snparser_alloc();

  /* Begin by reading the header and getting dimension information */
  if (!readHeader(
        pSn, pIn, &point_count, &tri_count, pErrCode, pLine)) {
    status = 0;
  }

  /* Prepare the usage map using the point count */
  if (status) {
    usage_map_dim(&um, point_count);
  }

  /* Allocate the Lilac mesh structure */
  if (status) {
    /* Allocate and clear the structure memory */
    pM = (LILAC_MESH *) malloc(sizeof(LILAC_MESH));
    if (pM == NULL) {
      abort();
    }
    memset(pM, 0, sizeof(LILAC_MESH));
    
    /* Write the point and triangle counts in and initialize pointers to
     * NULL */
    pM->point_count = point_count;
    pM->tri_count = tri_count;
    
    pM->pPoints = NULL;
    pM->pTris = NULL;
    
    /* Allocate non-empty arrays and clear to zero */
    if (point_count > 0) {
      pM->pPoints = (LILAC_MESH_POINT *) calloc(
                                            point_count,
                                            sizeof(LILAC_MESH_POINT));
      if (pM->pPoints == NULL) {
        abort();
      }
    }
    
    if (tri_count > 0) {
      pM->pTris = (uint16_t *) calloc(
                                  (tri_count * 3),
                                  sizeof(uint16_t));
      if (pM->pTris == NULL) {
        abort();
      }
    }
  }

  /* Interpret the Shastina mesh file */
  if (status) {
    /* Go through tokens until EOF or error */
    for(snparser_read(pSn, &ent, pIn);
        ent.status > 0;
        snparser_read(pSn, &ent, pIn)) {

      /* We read an entity (after the header), so handle the specific
       * type of entity */
      if (ent.status == SNENTITY_NUMERIC) {
        /* Parse the numeric entity */
        i = parseNumber(ent.pKey);
        if (i < 0) {
          status = 0;
          *pErrCode = LILAC_MESH_ERR_NUMBER;
          *pLine = snparser_count(pSn);
        }
        
        /* Make sure we have room on interpreter stack */
        if (status && (st_count >= MAX_SN_STACK)) {
          status = 0;
          *pErrCode = LILAC_MESH_ERR_OVERFL;
          *pLine = snparser_count(pSn);
        }
        
        /* Push the numeric value on the interpreter stack */
        if (status) {
          st[st_count] = (uint16_t) i;
          st_count++;
        }
      
      } else if (ent.status == SNENTITY_OPERATION) {
        /* Handle the operation types */
        if (strcmp(ent.pKey, "p") == 0) {
          /* Point operation, so make sure enough parameters on
           * interpreter stack */
          if (st_count < 4) {
            status = 0;
            *pErrCode = LILAC_MESH_ERR_UNDERF;
            *pLine = snparser_count(pSn);
          }
          
          /* Invoke operation with the appropriate parameters */
          if (status) {
            if (!op_p(
                    st[st_count - 4],
                    st[st_count - 3],
                    st[st_count - 2],
                    st[st_count - 1],
                    pM,
                    &points_written,
                    pErrCode)) {
              status = 0;
              *pLine = snparser_count(pSn);
            }
          }
          
          /* Clear operation parameters from stack */
          if (status) {
            st_count -= 4;
          }
          
        } else if (strcmp(ent.pKey, "t") == 0) {
          /* Triangle operation, so make sure enough parameters on
           * interpreter stack */
          if (st_count < 3) {
            status = 0;
            *pErrCode = LILAC_MESH_ERR_UNDERF;
            *pLine = snparser_count(pSn);
          }
          
          /* Invoke operation with the appropriate parameters */
          if (status) {
            if (!op_t(
                    st[st_count - 3],
                    st[st_count - 2],
                    st[st_count - 1],
                    pM,
                    points_written,
                    &tris_written,
                    &um,
                    pErrCode)) {
              status = 0;
              *pLine = snparser_count(pSn);
            }
          }
          
          /* Clear operation parameters from stack */
          if (status) {
            st_count -= 3;
          }
          
        } else {
          /* Unrecognized operation */
          status = 0;
          *pErrCode = LILAC_MESH_ERR_BADOP;
          *pLine = snparser_count(pSn);
        }
      
      } else {
        /* Unsupported entity type */
        status = 0;
        *pErrCode = LILAC_MESH_ERR_ETYPE;
        *pLine = snparser_count(pSn);
      }
      
      /* Leave loop if error */
      if (!status) {
        break;
      }
    }
 
    /* If parsing error encountered, report it */
    if (status && (ent.status < 0)) {
      status = 0;
      *pErrCode = ent.status;
      *pLine = snparser_count(pSn);
    }
    
    /* If we got here successfully, we read the EOF token, so make sure
     * that stack is empty and everything has been written */
    if (status && (st_count > 0)) {
      status = 0;
      *pErrCode = LILAC_MESH_ERR_REM;
      *pLine = 0;
    }
    
    if (status && (points_written != point_count)) {
      status = 0;
      *pErrCode = LILAC_MESH_ERR_PUNDEF;
      *pLine = 0;
    }
    
    if (status && (tris_written != tri_count)) {
      status = 0;
      *pErrCode = LILAC_MESH_ERR_TUNDEF;
      *pLine = 0;
    }
    
    /* Check for orphan points */
    if (status && usage_map_orphan(&um)) {
      status = 0;
      *pErrCode = LILAC_MESH_ERR_ORPHAN;
      *pLine = 0;
    }
  }

  /* Reset usage map to release any memory */
  usage_map_reset(&um);
  
  /* Free parser if allocated */
  snparser_free(pSn);
  pSn = NULL;
  
  /* If failure and mesh allocated, release it */
  if (!status) {
    lilac_mesh_free(pM);
    pM = NULL;
  }
  
  /* If failure, make sure line count is valid else set to zero */
  if (!status) {
    if ((*pLine < 1) || (*pLine >= LONG_MAX)) {
      *pLine = 0;
    }
  }
  
  /* Return mesh pointer or NULL */
  return pM;
}

/*
 * lilac_mesh_free function.
 */
void lilac_mesh_free(LILAC_MESH *pLm) {
  
  /* Only proceed if non-NULL value passed */
  if (pLm != NULL) {
  
    /* Free the arrays if allocated */
    if (pLm->pPoints != NULL) {
      free(pLm->pPoints);
      pLm->pPoints = NULL;
    }
  
    if (pLm->pTris != NULL) {
      free(pLm->pTris);
      pLm->pTris = NULL;
    }
  
    /* Free the main structure */
    free(pLm);
    pLm = NULL;
  }
}

/*
 * lilac_mesh_errstr function.
 */
const char *lilac_mesh_errstr(int code) {
  
  const char *pResult = NULL;
  
  switch (code) {
  
    case LILAC_MESH_ERR_OK:
      pResult = "No error";
      break;
    
    case LILAC_MESH_ERR_REM:
      pResult = "Elements remain on the interpreter stack at end";
      break;
    
    case LILAC_MESH_ERR_PUNDEF:
      pResult = "Points remain undefined in mesh";
      break;
    
    case LILAC_MESH_ERR_TUNDEF:
      pResult = "Triangles remain undefined in mesh";
      break;
    
    case LILAC_MESH_ERR_ORPHAN:
      pResult = "Orphan points detected in mesh";
      break;
    
    case LILAC_MESH_ERR_ETYPE:
      pResult = "Unsupported Shastina entity type";
      break;
    
    case LILAC_MESH_ERR_NUMBER:
      pResult = "Invalid numeric literal";
      break;
    
    case LILAC_MESH_ERR_OVERFL:
      pResult = "Interpreter stack overflow";
      break;
    
    case LILAC_MESH_ERR_BADOP:
      pResult = "Unrecognized mesh operation";
      break;
    
    case LILAC_MESH_ERR_UNDERF:
      pResult = "Stack underflow during operation";
      break;
    
    case LILAC_MESH_ERR_NOSIG:
      pResult = "Failed to read Lilac mesh signature";
      break;
    
    case LILAC_MESH_ERR_SIGVER:
      pResult = "Lilac mesh signature for unsupported version";
      break;
    
    case LILAC_MESH_ERR_NODIM:
      pResult = "Failed to read Lilac mesh dimensions metacommand";
      break;
    
    case LILAC_MESH_ERR_BADDIM:
      pResult = "Invalid Lilac mesh dimension metacommand syntax";
      break;
    
    case LILAC_MESH_ERR_DIMVAL:
      pResult = "Lilac mesh dimension value is out of range";
      break;
    
    case LILAC_MESH_ERR_PCOUNT:
      pResult = "Declared mesh point count is out of allowed range";
      break;
    
    case LILAC_MESH_ERR_TCOUNT:
      pResult = "Declared mesh triangle count is out of allowed range";
      break;
    
    case LILAC_MESH_ERR_NORMDA:
      pResult = "norma must be zero when normd is zero";
      break;
    
    case LILAC_MESH_ERR_NORM2P:
      pResult = "norma must be less than 2*PI radians";
      break;
    
    case LILAC_MESH_ERR_PTOVER:
      pResult = "More points defined than were declared in dimensions";
      break;
    
    case LILAC_MESH_ERR_PTREF:
      pResult = "Triangle references point that hasn't been defined";
      break;
    
    case LILAC_MESH_ERR_VXDUP:
      pResult = "Triangle has duplicated vertex point";
      break;
    
    case LILAC_MESH_ERR_VXORD:
      pResult = "First triangle vertex must have lowest numeric index";
      break;
    
    case LILAC_MESH_ERR_ORIENT:
      pResult = "Triangle vertices must be in counter-clockwise order";
      break;
    
    case LILAC_MESH_ERR_TRSORT:
      pResult = "Triangles are sorted incorrectly in list";
      break;
    
    case LILAC_MESH_ERR_DUPEDG:
      pResult = "Same directed triangle edge used more than once";
      break;
    
    default:
      if (code < 0) {
        pResult = snerror_str(code);
      } else {
        pResult = "Unknown error";
      }
  }
  
  return pResult;
}
