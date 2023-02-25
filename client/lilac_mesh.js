/*
 * lilac_mesh.js
 * =============
 * 
 * The main JavaScript module supporting lilac_mesh.html.
 */

/*
 * Module inclusion
 * ----------------
 */

if (typeof LILAC_MESH_JS_INCLUDED !== "undefined") {
  console.log("entry.js: Module included more than once!");
  throw "include";
}
var LILAC_MESH_JS_INCLUDED = true;

/*
 * Constants
 * ---------
 */

/*
 * The minimum dimension (width or height) allowed for source images for
 * the trace layer.
 */
var TRACE_IMAGE_MIN_DIM = 2;

/*
 * The minimum and maximum dimensions (width or height) allowed for the
 * trace layer.
 */
var TRACE_LAYER_MIN_DIM = 2;
var TRACE_LAYER_MAX_DIM = 16384;

/*
 * The maximum unique ID value that can be assigned to a point.
 */
var MAX_POINT_UID = 2000000000;

/*
 * Local data
 * ----------
 */

var m_lilac_mesh = {
  
  /* 
   * The points array stores all the points that have been added.
   *
   * Each point is an object with the following properties:
   * 
   *   .uid : integer that is a unique ID for the point; array is sorted
   *   in ascending order of this field; in range [1, MAX_POINT_UID].
   * 
   *   .normd : normalized distance from origin, in range [0.0, 1.0],
   *   where 0.0 means normal pointing directly at viewer and 1.0 means
   *   normal at a 90-degree angle away from viewer
   * 
   *   .norma : normalized angle, in range [0.0, 1.0), where 0.0 means
   *   zero radians and 1.0 is 2*PI radians.  Combined with normd,
   *   defines the 3D normal at this point
   * 
   *   .x : the normalized X coordinate, in range [0.0, 1.0]; assumes an
   *   aspect ratio of 16:9
   * 
   *   .y : the normalized Y coordinate, in range [0.0, 1.0]; assumes an
   *   aspect ratio of 16:9
   */
  "points": [],

  /*
   * The tris array stores all the triangles that have been defined on
   * the points.
   * 
   * Each triangle is an array of three integers.  The integers must
   * each be unique within the array, they must be in ascending order,
   * and each must reference the uid of a point in the points array.
   */
  "tris": [],
  
  /*
   * The sel array stores all the points that are currently selected.
   * 
   * It is an array of unique integers in ascending order where each
   * integer must be the uid of a point defined in the points array.
   */
  "sel": []
};

/*
 * Local functions
 * ---------------
 */

/*
 * Report an error to console and throw an exception for a fault
 * occurring within this lilac_mesh.js module.
 *
 * Parameters:
 *
 *   func_name : string - the name of the function in this module
 *
 *   loc : number(int) - the location within the function
 */
function lilac_mesh_fault(func_name, loc) {
  
  // If parameters not valid, set to unknown:0
  if ((typeof func_name !== "string") || (typeof loc !== "number")) {
    func_name = "unknown";
    loc = 0;
  }
  loc = Math.floor(loc);
  if (!isFinite(loc)) {
    loc = 0;
  }
  
  // Report error to console
  console.log("Fault at " + func_name + ":" + String(loc) +
                " in lilac_mesh.js");
  
  // Throw exception
  throw ("lilac_mesh.js:" + func_name + ":" + String(loc));
}

/*
 * Given the unique ID number of a point, locate that point within the
 * state object.
 * 
 * false is returned if no point has that uid.  Otherwise, the return
 * value is the index of the point within m_lilac_mesh.points.
 * 
 * Parameters:
 * 
 *   uid : number(int) - the point to check for
 * 
 * Return:
 * 
 *   the index of the point record in m_lilac_mesh.points, or false if
 *   no point has given uid
 */
function seek_point(uid) {
  
  var func_name = "seek_point";
  var lbound;
  var ubound;
  var mid;
  var midv;
  
  // Check parameter
  if (typeof uid !== "number") {
    lilac_mesh_fault(func_name, 100);
  }
  uid = Math.floor(uid);
  if (!isFinite(uid)) {
    lilac_mesh_fault(func_name, 150);
  }
  
  // If uid is out of allowed range, always return false
  if ((uid < 0) || (uid > MAX_POINT_UID)) {
    return false;
  }
  
  // If points array is empty, always return false
  if (m_lilac_mesh.points.length < 1) {
    return false;
  }
  
  // Perform a binary search for the point
  lbound = 0;
  ubound = m_lilac_mesh.points.length - 1;
  while (lbound < ubound) {
    // Get midpoint
    mid = lbound + Math.floor((ubound - lbound) / 2);
    
    // Make sure midpoint at least one above lower bound
    if (mid <= lbound) {
      mid = lbound + 1;
    }
    
    // Get midpoint value
    midv = m_lilac_mesh.points[mid].uid;
    
    // Adjust boundaries depending on comparison to midpoint value
    if (midv < uid) {
      // Desired record above the midpoint, so adjust lower bound
      lbound = mid + 1;
      
      // Make sure lower bound doesn't exceed upper bound
      if (lbound > ubound) {
        lbound = ubound;
      }
      
    } else if (midv > uid) {
      // Desired record below the midpoint, so adjust upper bound
      ubound = mid - 1;
      
    } else if (midv === uid) {
      // Found the desired record, so zoom in on it
      lbound = mid;
      ubound = mid;
      
    } else {
      // Shouldn't happen
      lilac_mesh_fault(func_name, 200);
    }
  }
  
  // Return the index if we found the record, else return false
  if (m_lilac_mesh.points[lbound].uid === uid) {
    return lbound;
  } else {
    return false;
  }
}

/*
 * Given the unique ID number of a point, locate that point within the
 * selected points array.
 * 
 * false is returned if no selected point has that uid.  Otherwise, the
 * return value is the index of the point within m_lilac_mesh.sel.
 * 
 * Parameters:
 * 
 *   uid : number(int) - the point to check for
 * 
 * Return:
 * 
 *   the index of the point record in m_lilac_mesh.sel, or false if no
 *   selected point has given uid
 */
function seek_sel(uid) {
  
  var func_name = "seek_sel";
  var lbound;
  var ubound;
  var mid;
  var midv;
  
  // Check parameter
  if (typeof uid !== "number") {
    lilac_mesh_fault(func_name, 100);
  }
  uid = Math.floor(uid);
  if (!isFinite(uid)) {
    lilac_mesh_fault(func_name, 150);
  }
  
  // If uid is out of allowed range, always return false
  if ((uid < 0) || (uid > MAX_POINT_UID)) {
    return false;
  }
  
  // If selected array is empty, always return false
  if (m_lilac_mesh.sel.length < 1) {
    return false;
  }
  
  // Perform a binary search for the point
  lbound = 0;
  ubound = m_lilac_mesh.sel.length - 1;
  while (lbound < ubound) {
    // Get midpoint
    mid = lbound + Math.floor((ubound - lbound) / 2);
    
    // Make sure midpoint at least one above lower bound
    if (mid <= lbound) {
      mid = lbound + 1;
    }
    
    // Get midpoint value
    midv = m_lilac_mesh.sel[mid];
    
    // Adjust boundaries depending on comparison to midpoint value
    if (midv < uid) {
      // Desired record above the midpoint, so adjust lower bound
      lbound = mid + 1;
      
      // Make sure lower bound doesn't exceed upper bound
      if (lbound > ubound) {
        lbound = ubound;
      }
      
    } else if (midv > uid) {
      // Desired record below the midpoint, so adjust upper bound
      ubound = mid - 1;
      
    } else if (midv === uid) {
      // Found the desired record, so zoom in on it
      lbound = mid;
      ubound = mid;
      
    } else {
      // Shouldn't happen
      lilac_mesh_fault(func_name, 200);
    }
  }
  
  // Return the index if we found the record, else return false
  if (m_lilac_mesh.sel[lbound] === uid) {
    return lbound;
  } else {
    return false;
  }
}

/*
 * Public functions
 * ----------------
 */

/*
 * Given an <img> element that is loaded with an image, and a target
 * width and height, derive a tracing layer from it.
 * 
 * The given image should be successfully loaded before this function is
 * called.  Also, the image source should not be from a different origin
 * that would cause the browser to prevent image data from being read by
 * scripts.  Finally, the natural image dimensions must be at least the
 * value of TRACE_IMAGE_MIN_DIM.
 * 
 * target_width and target_height specify the canvas dimensions, which
 * define how large the tracing layer will be.  They must both be in the
 * range [TRACE_LAYER_MIN_DIM, TRACE_LAYER_MAX_DIM].
 * 
 * Parameters:
 * 
 *   img : HTMLImageElement - the source image
 * 
 *   target_width : Number(int) - the width of the target in pixels
 * 
 *   target_height : Number(int) - the height of the target in pixels
 * 
 * Return:
 * 
 *   an ImageData object of the given dimensions containing the tracing
 *   layer
 */
function derive_trace_layer(img, target_width, target_height) {
  
  var func_name = "derive_trace_layer";
  var cv;
  var rc;
  var tx;
  var ty;
  var tw;
  var th;
  var sx;
  var sy;
  var sf;
  var r;
  
  // Check parameter types
  if ((typeof img !== "object") ||
      (typeof target_width !== "number") ||
      (typeof target_height !== "number")) {
    lilac_mesh_fault(func_name, 100);
  }
  if (!(img instanceof HTMLImageElement)) {
    lilac_mesh_fault(func_name, 110);
  }
  target_width = Math.floor(target_width);
  target_height = Math.floor(target_height);
  if ((!isFinite(target_width)) || (!isFinite(target_height))) {
    lilac_mesh_fault(func_name, 120);
  }
  
  // Check target dimension ranges
  if ((target_width < TRACE_LAYER_MIN_DIM) ||
      (target_width > TRACE_LAYER_MAX_DIM) ||
      (target_height < TRACE_LAYER_MIN_DIM) ||
      (target_height > TRACE_LAYER_MAX_DIM)) {
    lilac_mesh_fault(func_name, 130);
  }
  
  // Check source image
  if ((!img.complete) ||
      (img.naturalWidth < TRACE_IMAGE_MIN_DIM) ||
      (img.naturalHeight < TRACE_IMAGE_MIN_DIM)) {
    lilac_mesh_fault(func_name, 140);
  }
  
  // Create a new canvas for the tracing layer and set its dimensions
  cv = document.createElement("canvas");
  if (cv == null) {
    lilac_mesh_fault(func_name, 200);
  }
  
  cv.width = target_width;
  cv.height = target_height;
  
  // Get the 2D rendering context for this new canvas
  rc = cv.getContext("2d");
  if (rc == null) {
    lilac_mesh_fault(func_name, 210);
  }
  
  // Blank the canvas to white
  rc.fillStyle = "white";
  rc.fillRect(0, 0, target_width, target_height);
  
  // Check whether either source image dimension exceeds the target
  // dimension
  if ((img.naturalWidth > target_width) ||
      (img.naturalHeight > target_height)) {
    // Source image somehow overflows canvas boundaries, so calculate
    // scaling factors needed for shrinking
    sx = img.naturalWidth / target_width;
    sy = img.naturalHeight / target_height;
    
    // Determine target by whichever shrinking factor is larger
    if (sx >= sy) {
      // Both shrinking factors the same or X factor larger, so use the
      // X shrinking factor
      sf = sx;
      
      // Since we are using the X shrinking factor, blit-target X is
      // zero and blit-target width is same as target width
      tx = 0;
      tw = target_width;
      
      // Figure out how much space remains in Y dimension since
      // shrinking factor might be larger
      r = target_height - (img.naturalHeight / sf);
      
      // If remainder is greater than zero, set blit-target Y to half
      // the remainder to center image vertically; else, set blit-target
      // Y to zero; also compute the blit-target height in both cases
      if (r > 0) {
        ty = r / 2;
        th = target_height - r;
      } else {
        ty = 0;
        th = target_height;
      }
      
    } else if (sy > sx) {
      // Y shrinking factor is larger, so use the Y shrinking factor
      sf = sy;
      
      // Since we are using the Y shrinking factor, blit-target Y is
      // zero and blit-target height is same as target height
      ty = 0;
      th = target_height;
      
      // Figure out how much space remains in X dimension since
      // shrinking factor might be larger
      r = target_width - (img.naturalWidth / sf);
      
      // If remainder is greater than zero, set blit-target X to half
      // the remainder to center image horizontally; else, set
      // blit-target X to zero; also compute the blit-target width in
      // both cases
      if (r > 0) {
        tx = r / 2;
        tw = target_width - r;
      } else {
        tx = 0;
        tw = target_width;
      }
      
    } else {
      // Shouldn't happen
      lilac_mesh_fault(func_name, 300);
    }
    
  } else {
    // Source image entirely within canvas bounds, so calculate scaling
    // factors as needed for enlargement
    sx = target_width / img.naturalWidth;
    sy = target_height / img.naturalHeight;
    
    // Determine target by whichever scaling factor is smaller
    if (sx <= sy) {
      // Both scaling factors the same or X factor smaller, so use the
      // X scaling factor
      sf = sx;
      
      // Since we are using the X scaling factor, blit-target X is zero
      // and blit-target width is same as target width
      tx = 0;
      tw = target_width;
      
      // Figure out how much space remains in Y dimension since scaling
      // factor might be smaller
      r = target_height - (img.naturalHeight * sf);
      
      // If remainder is greater than zero, set blit-target Y to half
      // the remainder to center image vertically; else, set blit-target
      // Y to zero; also compute the blit-target height in both cases
      if (r > 0) {
        ty = r / 2;
        th = target_height - r;
      } else {
        ty = 0;
        th = target_height;
      }
      
    } else if (sy < sx) {
      // Y scaling factor is smaller, so use the Y scaling factor
      sf = sy;
      
      // Since we are using the Y scaling factor, blit-target Y is zero
      // and blit-target height is same as target height
      ty = 0;
      th = target_height;
      
      // Figure out how much space remains in X dimension since scaling
      // factor might be smaller
      r = target_width - (img.naturalWidth * sf);
      
      // If remainder is greater than zero, set blit-target X to half
      // the remainder to center image horizontally; else, set
      // blit-target X to zero; also compute the blit-target width in
      // both cases
      if (r > 0) {
        tx = r / 2;
        tw = target_width - r;
      } else {
        tx = 0;
        tw = target_width;
      }
    
    } else {
      // Shouldn't happen
      lilac_mesh_fault(func_name, 350);
    }
  }
  
  // Blit the image to the computed blit-target area on the canvas, and
  // perform alpha compositing as well as setting source image to 50%
  // transparency during operation
  rc.globalCompositeOperation = "source-over";
  rc.globalAlpha = 0.5;
  rc.drawImage(
          img,
          0, 0,
          img.naturalWidth, img.naturalHeight,
          tx, ty,
          tw, th);
  
  // Return the ImageData from the drawn canvas
  return rc.getImageData(0, 0, target_width, target_height);
}

/*
 * Return the current overlay, which is the graphics that should be
 * drawn on top of the trace image.
 * 
 * The return value is an object with the following parameters:
 * 
 *   .lines : array of four-element arrays, each four-element array
 *   describing a line to draw as [x1, y1, x2, y2]
 * 
 *   .pts : array of two-element arrays, each two-element array
 *   describing an unselected control point to draw at [x, y]
 * 
 *   .sels : array of two-element arrays, each two-element array
 *   describing a selected control point to draw at [x, y]
 * 
 * All returned coordinates are in normalized range [0.0, 1.0], and the
 * canvas they will be drawn onto is assumed to have an aspect ratio of
 * 16:9.
 * 
 * Return:
 * 
 *   the result object with the format described above
 */
function get_overlay() {
  
  var func_name = "get_overlay";
  var result;
  var la;
  var i;
  var t;
  var v;
  var a;
  var b;
  
  // Start with an empty result object
  result = {};
  
  // Build a list of all line segments using unique point identifiers;
  // each line segment is a two-integer array of point identifiers where
  // the first point identifier is less than the second
  la = [];
  for(i = 0; i < m_lilac_mesh.tris.length; i++) {
    // Get this triangle
    t = m_lilac_mesh.tris[i];
    
    // Make sure ascending order of points
    if (!((t[0] < t[1]) && (t[1] < t[2]))) {
      lilac_mesh_fault(func_name, 100);
    }
    
    // Add three line segments to the list with point IDs in ascending
    // order
    la.push([t[0], t[1]]);
    la.push([t[1], t[2]]);
    la.push([t[0], t[2]]);
  }
  
  // Since triangles may share line segments, next we need to sort the
  // line segment array so that we can find duplicate segments
  la.sort(function(a, b) {
    if (a[0] < b[0]) {
      return -1;
    } else if (a[0] > b[0]) {
      return 1;
    } else {
      if (a[1] < b[1]) {
        return -1;
      } else if (a[1] > b[1]) {
        return 1;
      } else {
        return 0;
      }
    }
  });
  
  // Render only unique line segments
  result.lines = [];
  for(i = 0; i < la.length; i++) {
    // Get current line segment
    t = la[i];
    
    // If this is not the first line segment, check whether this is the
    // same as previous line segment and skip it if so
    if (i > 0) {
      v = la[i - 1];
      if ((t[0] === v[0]) && (t[1] === v[1])) {
        continue;
      }
    }
    
    // Current line segment is unique so we need to render it -- get the
    // point records
    a = seek_point(t[0]);
    b = seek_point(t[1]);
    if ((a === false) || (b === false)) {
      lilac_mesh_fault(func_name, 200);
    }
    
    // Add the line segment to the render list
    result.lines.push([
      m_lilac_mesh.points[a].x,
      m_lilac_mesh.points[a].y,
      m_lilac_mesh.points[b].x,
      m_lilac_mesh.points[b].y
    ]);
  }
  
  // Build the selected and unselected points lists
  result.pts = [];
  result.sels = [];
  for(i = 0; i < m_lilac_mesh.points.length; i++) {
    // Get current point
    a = m_lilac_mesh.points[i];
    
    // Check whether selected or not
    if (seek_sel(a.uid) !== false) {
      // Selected point, so add to selected list
      result.sels.push([a.x, a.y]);
      
    } else {
      // Unselected point, so add to unselected list
      result.pts.push([a.x, a.y]);
    }
  }
  
  // Return constructed results object
  return result;
}
