"use strict";

/*
 * LilacMesh.js
 * ============
 * 
 * Definition of the LilacMesh class.
 * 
 * Internal data structure
 * -----------------------
 * 
 * LilacMesh objects follow the Lilac Mesh Format documented in
 * MeshFormat.md, except they decode the encoded fields into their
 * decoded equivalents as follows:
 * 
 *   (1) the "uid" field value of point objects is replaced with its
 *       decoded integer value
 * 
 *   (2) each encoded string element in triangle arrays is replaced with
 *       its decoded integer value
 * 
 *   (3) the "nrm" field of point objects is dropped and replaced by two
 *       fields, "normd" and "norma" which store the normalized,
 *       floating-point direction away from viewer and the normalized
 *       angle, respectively -- both in range [0.0, 1.0]
 * 
 *   (4) the "loc" field of point objects is dropped and replaced by two
 *       fields, "x" and "y" which store the normalized, floating-point
 *       X and Y coordinates on the tracing image -- both in range
 *       [0.0, 1.0].
 * 
 *   (5) any defined properties in the JSON that are not included in the
 *       Lilac Mesh Format specification are dropped
 * 
 * Also, the "points" and "tris" arrays are intended to be private, so
 * they are renamed "_points" and "_tris"
 * 
 * There is also an internal "_dirty" flag that stores whether the mesh
 * has changed.  See "isDirty()" for more information.
 */

/*
 * Constructor definition
 * ======================
 */

/*
 * Constructor for LilacMesh objects.
 * 
 * Invoke this with the "new" keyword to construct a new LilacMesh
 * object.  The initial state of the object is blank, with no points and
 * no triangles defined.  The initial state is not dirty.
 */
function LilacMesh() {
  this._points = [];
  this._tris = [];
  this._dirty = false;
}

/*
 * Public constants
 * ================
 */

/*
 * The maximum unique ID value that can be assigned to a point.
 */
LilacMesh.MAX_POINT_ID = 1073741823;

/*
 * Private static functions
 * ========================
 */

/*
 * Report an error to console and throw an exception for a fault
 * occurring within this module.
 *
 * Parameters:
 *
 *   func_name : string - the name of the function in this module
 *
 *   loc : number(int) - the location within the function
 */
LilacMesh._fault = function(func_name, loc) {
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
                " in LilacMesh");
  
  // Throw exception
  throw ("LilacMesh:" + func_name + ":" + String(loc));
};

/*
 * Numeric comparison function, used for sorting an array of numbers.
 * 
 * Parameters:
 * 
 *   a - the first parameter
 * 
 *   b - the second parameter
 */
LilacMesh._numericCmp = function(a, b) {
  
  var func_name = "_numericCmp";
  
  // Check we got two finite numbers
  if ((typeof a !== "number") || (typeof b !== "number")) {
    LilacMesh._fault(func_name, 100);
  }
  if (!(isFinite(a) && isFinite(b))) {
    LilacMesh._fault(func_name, 110);
  }
  
  // Compare numerically
  if (a < b) {
    return -1;
  } else if (a > b) {
    return 1;
  } else if (a == b) {
    return 0;
  } else {
    LilacMesh._fault(func_name, 200);
  }
};

/*
 * Decode an encoded UID string to its numeric value.
 * 
 * false is returned if the given parameter is not a string in the
 * proper encoding.
 * 
 * Parameters:
 * 
 *   str : string | mixed - the string to decode
 * 
 * Return:
 * 
 *   the decoded numeric UID value as an integer, or false
 */
LilacMesh._decodeUID = function(str) {
  
  var result;
  var i, c;
  
  // Check parameter type
  if (typeof str !== "string") {
    return false;
  }
  
  // Check that length of string between one and eight characters
  if ((str.length < 1) || (str.length > 8)) {
    return false;
  }
  
  // Check that first digit is not zero
  if (str.charAt(0) === "0") {
    return false;
  }
  
  // Check that all characters are base-16 digits
  for(i = 0; i < str.length; i++) {
    c = str.charCodeAt(i);
    if (((c < 0x30) || (c > 0x39)) &&
        ((c < 0x41) || (c > 0x46)) &&
        ((c < 0x61) || (c > 0x66))) {
      return false;
    }
  }
  
  // Decode base-16 value
  result = parseInt(str, 16);
  
  // Check range
  if ((result < 1) || (result > LilacMesh.MAX_POINT_ID)) {
    return false;
  }
  
  // Return result
  return result;
}

/*
 * Encode a pair of normalized floating-point values into an encoded
 * string pair.
 * 
 * The given values must be finite numbers in normalized range.
 * 
 * The integer equivalents will be in range [0, 16384].  However, if
 * isNorm is set to true, then this will prevent the second integer
 * value from being 16384 (clamping it to a maximum of 16383), and if
 * the first integer resolves to zero, the second integer will be set to
 * zero also.  These additional restrictions are necessary for encoded
 * normal fields.
 * 
 * Parameters:
 * 
 *   v1 : number - the first floating-point value to encode
 * 
 *   v2 : number - the second floating-point value to encode
 * 
 *   isNorm : boolean - true to apply encoded normal restrictions, false
 *   otherwise
 * 
 * Return:
 * 
 *   string with the encoded pair
 */
LilacMesh._encodePair = function(v1, v2, isNorm) {
  
  var func_name = "_encodePair";
  
  // Check parameters
  if ((typeof v1 !== "number") || (typeof v2 !== "number")) {
    LilacMesh._fault(func_name, 100);
  }
  if ((!isFinite(v1)) || (!isFinite(v2))) {
    LilacMesh._fault(func_name, 110);
  }
  if ((!((v1 >= 0) && (v1 <= 1))) ||
      (!((v2 >= 0) && (v2 <= 1)))) {
    LilacMesh._fault(func_name, 120);
  }
  if (typeof isNorm !== "boolean") {
    LilacMesh._fault(func_name, 130);
  }
  
  // Convert floating-point to integer and clamp to range
  v1 = Math.floor(v1 * 16384);
  v2 = Math.floor(v2 * 16384);
  
  v1 = Math.max(0, v1);
  v2 = Math.max(0, v2);
  
  v1 = Math.min(16384, v1);
  v2 = Math.min(16384, v2);
  
  // If isNorm is set, apply additional checks
  if (isNorm) {
    // Clamp second integer value to maximum of 16383
    v2 = Math.min(16383, v2);
    
    // If first integer is zero, second is also zero
    if (v1 === 0) {
      v2 = 0;
    }
  }
  
  // Build the encoded string
  return (String(v1) + "," + String(v2));
};

/*
 * Decode an encoded string pair of normalized values.
 * 
 * If successful, the return value is an array with the two decoded
 * floating-point values, each in range [0.0, 1.0].  Otherwise, false is
 * returned.
 * 
 * If the isNorm flag is true, then this also verifies that the second
 * encoded value is not 1.0, and that if the first encoded value is 0.0,
 * the second encoded value is 0.0 too.
 * 
 * Parameters:
 * 
 *   str : string | mixed - the string to decode
 * 
 *   isNorm : boolean - true to apply additional restrictions on the
 *   encoded nrm field, false otherwise
 * 
 * Return:
 * 
 *   an array of the two decoded floating-point values, or false if
 *   decoding failed
 */
LilacMesh._decodePair = function(str, isNorm) {
  
  var func_name = "decodePair";
  var i;
  var c;
  var found_comma;
  var result;
  
  // Check parameter types
  if (typeof str !== "string") {
    return false;
  }
  if (typeof isNorm !== "boolean") {
    return false;
  }
  
  // Check string length
  if ((str.length < 3) || (str.length > 11)) {
    return false;
  }
  
  // Verify that every character in string is either a decimal digit or
  // a comma, that there is exactly one comma, and that the comma is
  // neither the first nor last character
  found_comma = false;
  for(i = 0; i < str.length; i++) {
    // Check for comma
    if (str.charAt(i) === ",") {
      // Make sure first comma found and set found_comma flag
      if (found_comma) {
        return false;
      } else {
        found_comma = true;
      }
      
      // Make sure neither first nor last character
      if ((i < 1) || (i >= str.length - 1)) {
        return false;
      }
    
    } else {
      // Not a comma, so verify that character is decimal digit
      c = str.charCodeAt(i);
      if ((c < 0x30) || (c > 0x39)) {
        return false;
      }
    }
  }
  if (!found_comma) {
    return false;
  }
  
  // Split string into two fields around the comma
  result = str.split(",");
  if (result.length !== 2) {
    // Shouldn't happen
    LilacMesh._fault(func_name, 100);
  }
  
  // Both fields should be between one and five characters
  if ((result[0].length < 1) || (result[0].length > 5) ||
      (result[1].length < 1) || (result[1].length > 5)) {
    return false;
  }
  
  // Fields that are more than one character must not start with zero
  if (result[0].length > 1) {
    if (result[0].charAt(0) === "0") {
      return false;
    }
  }
  if (result[1].length > 1) {
    if (result[1].charAt(0) === "0") {
      return false;
    }
  }
  
  // Parse the two fields as decimal integers
  result[0] = parseInt(result[0], 10);
  result[1] = parseInt(result[1], 10);
  
  // If isNorm flag is specified, check additional restrictions
  if (isNorm) {
    if (result[1] > 16383) {
      return false;
    }
    if (result[0] === 0) {
      if (result[1] !== 0) {
        return false;
      }
    }
  }
  
  // Make sure both fields are in range and convert them to floating
  // point
  for(i = 0; i < result.length; i++) {
    if ((result[i] >= 0) && (result[i] <= 16384)) {
      result[i] = result[i] / 16384;
    } else {
      return false;
    }
  }
  
  // If we got here, return parsed result
  return result;
};

/*
 * Given the unique ID number of a point, locate that point within a
 * point array.
 * 
 * false is returned if no point has that uid.  Otherwise, the return
 * value is the index of the point within points array.
 * 
 * Undefined behavior occurs if the given array is not a properly sorted
 * point array.
 * 
 * Parameters:
 * 
 *   a : Array - the array of point objects to search
 * 
 *   uid : number(int) - the point to check for
 * 
 * Return:
 * 
 *   the index of the point record in points array, or false if no
 *   point has given uid
 */
LilacMesh._seekPoint = function(a, uid) {
  
  var func_name = "_seekPoint";
  var lbound, ubound;
  var mid, midv;
  
  // Check parameters
  if (typeof a !== "object") {
    LilacMesh._fault(func_name, 25);
  }
  if (!(a instanceof Array)) {
    LilacMesh._fault(func_name, 50);
  }
  if (typeof uid !== "number") {
    LilacMesh._fault(func_name, 100);
  }
  if (!isFinite(uid)) {
    LilacMesh._fault(func_name, 110);
  }
  if (uid !== Math.floor(uid)) {
    LilacMesh._fault(func_name, 120);
  }
  
  // If uid is out of allowed range, always return false
  if ((uid < 1) || (uid > LilacMesh.MAX_POINT_ID)) {
    return false;
  }
  
  // If points array is empty, always return false
  if (a.length < 1) {
    return false;
  }
  
  // Perform a binary search for the point
  lbound = 0;
  ubound = a.length - 1;
  while (lbound < ubound) {
    // Get midpoint
    mid = lbound + Math.floor((ubound - lbound) / 2);
    
    // Make sure midpoint at least one above lower bound
    if (mid <= lbound) {
      mid = lbound + 1;
    }
    
    // Get midpoint value
    midv = a[mid].uid;
    
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
      LilacMesh._fault(func_name, 200);
    }
  }
  
  // Return the index if we found the record, else return false
  if (a[lbound].uid === uid) {
    return lbound;
  } else {
    return false;
  }
};

/*
 * Verify that the given JavaScript object has a valid internal data
 * structure for a LilacMesh.
 * 
 * This is intended to verify objects that have been deserialized from
 * JSON.  It is not necessary otherwise, because the instance functions
 * of LilacMesh will protect the internal integrity of the data.
 * However, it is also run before serializing with toJSON just to check
 * for any internal logic errors.
 * 
 * The format of the object must match that described in MeshFormat.md,
 * except that internal data structure transformations (1)-(4) described
 * at the top of this module must be applied (no need to drop additional
 * properties, and points and tris array should NOT be renamed with an
 * underscore yet).
 * 
 * Parameters:
 * 
 *   m : object | mixed - the mesh object to verify
 * 
 * Return:
 * 
 *   true if parameter is a valid mesh object, false otherwise
 */
LilacMesh._verify = function(m) {
  
  var i, j, k;
  var v;
  var pa, el, pb;
  var a, b, c;
  
  // Check type
  if (typeof m !== "object") {
    return false;
  }

  // Check for needed parameters
  if ((!("points" in m)) || (!("tris" in m))) {
    return false;
  }

  // Make sure both parameters are arrays
  if ((typeof m.points !== "object") ||
      (typeof m.tris !== "object")) {
    return false;
  }

  if ((!(m.points instanceof Array)) ||
      (!(m.tris instanceof Array))) {
    return false;
  }

  // Go through points array and verify each point
  for(i = 0; i < m.points.length; i++) {
    // Get current point
    v = m.points[i];
    
    // Make sure current point is an object
    if (typeof v !== "object") {
      return false;
    }
    
    // Make sure current point has required parameters
    if ((!("uid" in v)) || (!("normd" in v)) ||
        (!("norma" in v)) || (!("x" in v)) ||
        (!("y" in v))) {
      return false;
    }
    
    // Verify types of each parameter
    if ((typeof v.uid !== "number") ||
        (typeof v.normd !== "number") ||
        (typeof v.norma !== "number") ||
        (typeof v.x !== "number") ||
        (typeof v.y !== "number")) {
      return false;
    }
    
    // Verify all parameters are finite
    if ((!isFinite(v.uid)) || (!isFinite(v.normd)) ||
        (!isFinite(v.norma)) || (!isFinite(v.x)) ||
        (!isFinite(v.y))) {
      return false;
    }
    
    // Verify uid is an integer
    if (v.uid !== Math.floor(v.uid)) {
      return false;
    }
    
    // Verify ranges
    if (!((v.uid >= 1) && (v.uid <= LilacMesh.MAX_POINT_ID))) {
      return false;
    }
    
    if (!((v.normd >= 0.0) && (v.normd <= 1.0))) {
      return false;
    }
    
    if (!((v.norma >= 0.0) && (v.norma < 1.0))) {
      return false;
    }
    
    if (!((v.x >= 0.0) && (v.x <= 1.0))) {
      return false;
    }
    
    if (!((v.y >= 0.0) && (v.y <= 1.0))) {
      return false;
    }
    
    // If normd is zero, then norma must be zero also
    if (v.normd === 0.0) {
      if (v.norma !== 0.0) {
        return false;
      }
    }
    
    // If this is not first point, make sure that UID is greater than
    // previous point
    if (i > 0) {
      if (!(v.uid > m.points[i - 1].uid)) {
        return false;
      }
    }
  }

  // We've verified the points array, now move on to the triangles
  // array; also, build a list of all point UIDs referenced from
  // triangles, and all ordered edges in triangles
  pa = [];
  el = [];
  for(i = 0; i < m.tris.length; i++) {
    // Get current triangle
    v = m.tris[i];
    
    // Make sure current triangle is an array
    if (typeof v !== "object") {
      return false;
    }
    if (!(v instanceof Array)) {
      return false;
    }
    
    // Make sure triangle has exactly three elements
    if (v.length !== 3) {
      return false;
    }
    
    // Make sure that each element is an integer in UID range, and add
    // each point to the points reference array -- we will verify that
    // point UIDs are in the points array later
    for(j = 0; j < v.length; j++) {
      // Check that element is integer
      if (typeof v[j] !== "number") {
        return false;
      }
      if (!isFinite(v[j])) {
        return false;
      }
      if (v[j] !== Math.floor(v[j])) {
        return false;
      }
      
      // Check that element in range
      if (!((v[j] >= 1) && (v[j] <= LilacMesh.MAX_POINT_ID))) {
        return false;
      }
      
      // Add point to point array list
      pa.push(v[j]);
    }
    
    // Add each ordered edge to edge list
    el.push([v[0], v[1]]);
    el.push([v[1], v[2]]);
    el.push([v[2], v[0]]);
    
    // Verify that first point is less than other points and that second
    // and third points are not equal to each other
    if ((v[1] <= v[0]) || (v[2] <= v[0])) {
      return false;
    }
    if (v[1] === v[2]) {
      return false;
    }
    
    // Get the index of the three vertices in the points array -- all
    // must be found, or verification fails
    a = LilacMesh._seekPoint(m.points, v[0]);
    b = LilacMesh._seekPoint(m.points, v[1]);
    c = LilacMesh._seekPoint(m.points, v[2]);
    
    if ((a === false) || (b === false) || (c === false)) {
      return false;
    }
    
    // Get the actual point records of the vertices
    a = m.points[a];
    b = m.points[b];
    c = m.points[c];
    
    // Compute the cross product (P2-P1)x(P3-P1) to make sure that the
    // Z-axis vector has a magnitude greater than zero, ensuring that
    // the points on the triangle are not colinear and that they are in
    // counter-clockwise order; since the Z coordinates of our 2D points
    // are all zero, the X-axis and Y-axis vectors of the cross product
    // will always have zero magnitude, so we just need to compute the
    // Z-axis vector, which is ((x2-x1)*(y3-y1) - (y2-y1)*(x3-x1)), and
    // make sure this is greater than zero
    k = ((b.x - a.x) * (c.y - a.y)) - ((b.y - a.y) * (c.x - a.x));

    if (!isFinite(k)) {
      return false;
    }
    if (!(k > 0)) {
      return false;
    }
    
    // If not the first triangle, make sure strictly ascending order
    // according to triangle order (which only needs to examine the
    // first two vertices -- if the first two vertices were equal, it
    // would violate the restriction that ordered edges need to be
    // unique)
    if (i > 0) {
      for(j = 0; j < 2; j++) {
        if (v[j] > m.tris[i - 1][j]) {
          break;
        } else if (v[j] < m.tris[i - 1][j]) {
          return false;
        } else {
          if (j >= 1) {
            return false;
          }
        }
      }
    }
  }

  // Sort the point list accumulated from triangles
  pa.sort(LilacMesh._numericCmp);
  
  // Create a new point list that only has the unique, sorted points
  // derived from triangles
  pb = [];
  for(i = 0; i < pa.length; i++) {
    if (i < 1) {
      pb.push(pa[i]);
    } else {
      if (pa[i] !== pa[i - 1]) {
        pb.push(pa[i]);
      }
    }
  }

  // The unique point list derived from the triangles must have the same
  // length as the points array and have the same elements -- this
  // verifies both that there are no "orphan" points that are not
  // referenced from any triangle, and also that all UIDs referenced
  // from triangles refer to points defined in the points array
  if (pb.length !== m.points.length) {
    return false;
  }
  for(i = 0; i < pb.length; i++) {
    if (m.points[i].uid !== pb[i]) {
      return false;
    }
  }

  // Sort the ordered edge list
  el.sort(function(a, b) {
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

  // Make sure there are no duplicate ordered edges
  for(i = 1; i < el.length; i++) {
    if ((el[i][0] === el[i - 1][0]) &&
        (el[i][1] === el[i - 1][1])) {
      return false;
    }
  }

  // If we got here, the object is verified
  return true;
};

/*
 * Private instance functions
 * ==========================
 */

/*
 * Insert a triangle vertex array into the triangle list in the
 * appropriate triangle order.
 * 
 * This does not verify that the triangle array is valid beyond checking
 * that it has three integers; it simply inserts in the proper place in
 * the array
 * 
 * Parameters:
 * 
 *   ta : Array - an array of three integers to insert into the triangle
 *   list
 */
LilacMesh.prototype._insertTri = function(ta) {
  
  var func_name = "_insertTri";
  var i, j, t;
  
  // Check parameter
  if ((typeof ta !== "object") || (!(ta instanceof Array))) {
    LilacMesh._fault(func_name, 100);
  }
  if (ta.length !== 3) {
    LilacMesh._fault(func_name, 110);
  }
  for(i = 0; i < ta.length; i++) {
    if ((typeof ta[i] !== "number") ||
        (!isFinite(ta[i])) ||
        (Math.floor(ta[i]) !== ta[i]) ||
        (ta[i] < 1) ||
        (ta[i] > LilacMesh.MAX_POINT_ID)) {
      LilacMesh._fault(func_name, 120);
    }
  }
  
  // If triangle array is empty, just insert as the first element and
  // go no further
  if (this._tris.length < 1) {
    this._tris.push([ta[0], ta[1], ta[2]]);
    return;
  }
  
  // Otherwise, find the index i of the first element in the triangle
  // list that is greater than the new triangle in the sorting order, or
  // set i to one beyond the last element if new triangle should come at
  // the end of the list
  for(i = 0; i < this._tris.length; i++) {
    // Get current triangle
    t = this._tris[i];
    
    // Check whether current element is greater, in which case break
    // here
    if (t[0] > ta[0]) {
      break;
    } else if (t[0] === ta[0]) {
      if (t[1] > ta[1]) {
        break;
      }
    }
  }
  
  // If new triangle should be added to end of list, add it there and
  // proceed no further
  if (i >= this._tris.length) {
    this._tris.push([ta[0], ta[1], ta[2]]);
    return;
  }
  
  // If we got here, i is the index of the element in the triangle
  // array before which we should insert the new triangle, so begin by
  // duplicating the last element at the end of the list
  this._tris.push(this._tris[this._tris.length - 1]);
  
  // Starting at the second to last element and working back to and
  // including i, shift all triangles in the list right by one
  for(j = this._tris.length - 2; j >= i; j--) {
    this._tris[j + 1] = this._tris[j];
  }
  
  // We can now insert the new element at index i, which is currently a
  // duplicate of i + 1
  this._tris[i] = [ta[0], ta[1], ta[2]];
};

/*
 * Public instance functions
 * =========================
 */

/*
 * Decode a mesh object from a JSON string and replace the current mesh
 * state with the decoded mesh object if successful.
 * 
 * str is the JSON data to decode.  If successful, the internal mesh
 * object state will be entirely replaced with the deserialized object
 * and true is returned.  If failure, there is no change in state and
 * false is returned.
 * 
 * Parameters:
 * 
 *   str : string | mixed - the JSON representation to decode
 * 
 * Return:
 * 
 *   true if successful, or false if decoding failed
 */
LilacMesh.prototype.fromJSON = function(str) {
  
  var m;
  var i, j;
  var p;
  var r;

  // Check parameter type
  if (typeof str !== "string") {
    return false;
  }
  
  // Attempt to decode the JSON
  try {
    m = JSON.parse(str);
  } catch (ex) {
    return false;
  }

  // Make sure the decoded object is an object
  if (typeof m !== "object") {
    return false;
  }
  
  // Make sure the decoded object has a points property and a tris
  // property
  if ((!("points" in m)) || (!("tris" in m))) {
    return false;
  }

  // Make sure the points property and tris property are arrays
  if (typeof m.points !== "object") {
    return false;
  }
  if (!(m.points instanceof Array)) {
    return false;
  }
  
  if (typeof m.tris !== "object") {
    return false;
  }
  if (!(m.tris instanceof Array)) {
    return false;
  }

  // Go through the points array and decode encoded string fields
  for(i = 0; i < m.points.length; i++) {
    // Get current point
    p = m.points[i];

    // Make sure current point is an object
    if (typeof p !== "object") {
      return false;
    }

    // Make sure current point has "uid" "nrm" and "loc" properties
    if ((!("nrm" in p)) || (!("loc" in p)) || (!("uid" in p))) {
      return false;
    }

    // Decod the "uid" field
    p.uid = LilacMesh._decodeUID(p.uid);
    if (p.uid === false) {
      return false;
    }

    // Decode the "nrm" field
    r = LilacMesh._decodePair(p.nrm, true);
    if (r === false) {
      return false;
    }

    // Add the decoded normd and norma fields, and drop the encoded
    // nrm field
    p.normd = r[0];
    p.norma = r[1];
    delete p.nrm;

    // Decode the "loc" field
    r = LilacMesh._decodePair(p.loc, false);
    if (r === false) {
      return false;
    }

    // Add the decoded x and y fields, and drop the encoded loc field
    p.x = r[0];
    p.y = r[1];
    delete p.loc;
  }

  // Go through the tris array and decode encoded string elements
  for(i = 0; i < m.tris.length; i++) {
    // Get current triangle
    p = m.tris[i];
    
    // Make sure current triangle is an array
    if (typeof p !== "object") {
      return false;
    }
    if (!(p instanceof Array)) {
      return false;
    }
    
    // Decode each element of the current triangle array
    for(j = 0; j < p.length; j++) {
      // Decode current element
      p[j] = LilacMesh._decodeUID(p[j]);
      if (p[j] === false) {
        return false;
      }
    }
  }

  // Perform verification
  if (!LilacMesh._verify(m)) {
    return false;
  }

  // We've verified, so now blank the internal state
  this._points = [];
  this._tris = [];
  
  // Copy the verified point data into the points structure
  for(i = 0; i < m.points.length; i++) {
    // Get current point
    p = m.points[i];
    
    // Add point data to array
    this._points.push({
      uid: p.uid,
      normd: p.normd,
      norma: p.norma,
      x: p.x,
      y: p.y
    });
  }
  
  // Copy the verified triangle data into the triangle list
  for(i = 0; i < m.tris.length; i++) {
    // Get current triangle array
    r = m.tris[i];
    
    // Add triangle to array
    this._tris.push([
      r[0], r[1], r[2]
    ]);
  }
  
  // Clear the dirty flag
  this._dirty = false;
  
  // Return that operation was successful
  return true;
};

/*
 * Encode this mesh object into a JSON string.
 * 
 * Return:
 * 
 *   the encoded JSON as a string
 */
LilacMesh.prototype.toJSON = function() {
  
  var func_name = "toJSON";
  var m;
  var p;
  var t;
  var i;
  
  // Make a copy of the internal mesh structure, renaming the _points
  // and _tris members to points and tris
  m = {"points": [], "tris": []};
  for(i = 0; i < this._points.length; i++) {
    m.points.push({
      "uid": this._points[i].uid,
      "normd": this._points[i].normd,
      "norma": this._points[i].norma,
      "x": this._points[i].x,
      "y": this._points[i].y
    });
  }
  for(i = 0; i < this._tris.length; i++) {
    m.tris.push([
      this._tris[i][0],
      this._tris[i][1],
      this._tris[i][2],
    ]);
  }
  
  // Verify our copy of the mesh state
  if (!LilacMesh._verify(m)) {
    LilacMesh._fault(func_name, 100);
  }
  
  // We have a verified mesh copy, so now go through the triangles
  // arrays and replace all array elements with strings storing the
  // decimal integer
  for(i = 0; i < m.tris.length; i++) {
    m.tris[i][0] = String(m.tris[i][0]);
    m.tris[i][1] = String(m.tris[i][1]);
    m.tris[i][2] = String(m.tris[i][2]);
  }
  
  // Go through the points list and change all points to the storage
  // format
  for(i = 0; i < m.points.length; i++) {
    // Get point
    p = m.points[i];
    
    // First, change the UID to its string equivalent
    p.uid = String(p.uid);
    
    // Second, encode the normal in a string and drop the individual
    // normal fields
    p.nrm = LilacMesh._encodePair(p.normd, p.norma, true);
    delete p.normd;
    delete p.norma;
    
    // Third, encode the point coordinates in a string and drop the
    // individual point coordinate fields
    p.loc = LilacMesh._encodePair(p.x, p.y, false);
    delete p.x;
    delete p.y;
  }
  
  // We've changed our copy of the mesh into storage format, so
  // serialize it into JSON
  return JSON.stringify(m, null, 2);
};

/*
 * Generate all the unique line segments for all defined triangles in
 * this mesh.
 * 
 * This function will filter out duplicates, so that if the same line is
 * shared by multiple triangles, it is only returned once.
 * 
 * The return value is an array of lines, each line being an array of
 * four numbers in [x1, y1, x2, y2] order.  Each coordinate is in
 * normalized image space [0.0, 1.0].
 * 
 * IMPORTANT:  note that the orientation of the Y axis is such that the
 * origin is in the BOTTOM-left corner.
 * 
 * Return:
 * 
 *   a list of unique line segments
 */
LilacMesh.prototype.toLines = function() {
  
  var func_name = "toLines";
  var result;
  var la;
  var i;
  var t;
  var v;
  var a;
  var b;
  
  // Build a list of all line segments using unique point identifiers;
  // each line segment is a two-integer array of point identifiers where
  // the first point identifier is less than the second
  la = [];
  for(i = 0; i < this._tris.length; i++) {
    // Get this triangle
    t = this._tris[i];
    
    // Make a copy of the triangle array
    t = [t[0], t[1], t[2]];
    
    // First vertex always has lowest numeric value; re-order second and
    // third vertices if necessary so that all vertices are in ascending
    // numeric order of UID
    if (t[1] > t[2]) {
      v = t[1];
      t[1] = t[2];
      t[2] = v;
    }
    
    // Make sure ascending order of points
    if (!((t[0] < t[1]) && (t[1] < t[2]))) {
      LilacMesh._fault(func_name, 100);
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
  result = [];
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
    a = LilacMesh._seekPoint(this._points, t[0]);
    b = LilacMesh._seekPoint(this._points, t[1]);
    if ((a === false) || (b === false)) {
      LilacMesh._fault(func_name, 200);
    }
    
    // Add the line segment to the render list
    result.push([
      this._points[a].x,
      this._points[a].y,
      this._points[b].x,
      this._points[b].y
    ]);
  }
  
  // Return result
  return result;
};

/*
 * Generate a list of all the triangle coordinates in this mesh.
 * 
 * The return value is an array of triangles, each triangle being an
 * array of six numbers in [x1, y1, x2, y2, x3, y3] order.  Each
 * coordinate is in normalized image space [0.0, 1.0].
 * 
 * IMPORTANT:  note that the orientation of the Y axis is such that the
 * origin is in the BOTTOM-left corner.
 * 
 * Return:
 * 
 *   a list of triangles
 */
LilacMesh.prototype.toTris = function() {
  
  var func_name = "toTris";
  var tl, t, v, p;
  var i, j;
  
  // Build the list of triangles
  tl = [];
  for(i = 0; i < this._tris.length; i++) {
    // Get a reference to the current triangle
    t = this._tris[i];
    
    // Build the coordinates
    v = [];
    for(j = 0; j < t.length; j++) {
      // Get index of current point
      p = LilacMesh._seekPoint(this._points, t[j]);
      if (p === false) {
        LilacMesh._fault(func_name, 100);
      }
      
      // Get point object
      p = this._points[p];
      
      // Add coordinates to triangle
      v.push(p.x);
      v.push(p.y);
    }
    
    // Add the triangle to the list
    tl.push(v);
  }
  
  // Return the triangle list
  return tl;
};

/*
 * Generate a list of all normals in this mesh.
 * 
 * The return value is an array of normals, each normal being an array
 * of four numbers in [x, y, dx, dy] order.  (dx, dy) is the
 * displacement from (x, y) origin, using a unit circle.  The length of
 * this displacement should be multiplied by the display length of a
 * normal to get the second coordinate when displaying.  X and Y
 * coordinates are in normalized image space [0.0, 1.0].
 * 
 * IMPORTANT:  note that the orientation of the Y axis is such that the
 * origin is in the BOTTOM-left corner.
 * 
 * Return:
 * 
 *   a list of normals
 */
LilacMesh.prototype.toNormals = function() {
  
  var func_name = "toNormals";
  var nl, p;
  var i;
  var dx, dy;
  
  // Build the normal list
  nl = [];
  for(i = 0; i < this._points.length; i++) {
    // Get reference to current point
    p = this._points[i];
    
    // Use norma to get (dx, dy) in the proper angle around the unit
    // circle
    dx = Math.cos(p.norma * 2 * Math.PI);
    dy = Math.sin(p.norma * 2 * Math.PI);
    
    // Scale both by normd to get the full displacement
    dx = dx * p.normd;
    dy = dy * p.normd;
    
    // Verify that result is finite
    if ((!isFinite(dx)) || (!isFinite(dy))) {
      LilacMesh._fault(func_name, 100);
    }
    
    // Add the normal to the list
    nl.push([p.x, p.y, dx, dy]);
  }
  
  // Return the normal list
  return nl;
};

/*
 * Generate a filtered list of vertex points.
 * 
 * filter is either false to generate a list of all points, or a
 * reference to a function that takes a single integer parameter and
 * returns a boolean value.
 * 
 * If filter is false, then the filtered list returned will include all
 * points.  Otherwise, for each point, the provided callback function
 * will be called with the point UID, and the callback function will
 * return true if the point should be included and false if the point
 * should not be included.
 * 
 * The return value is an array of point coordinates, where each point
 * coordinate is an array of two normalized coordinates in range from
 * 0.0 to 1.0, where the coordinates are ordered [x, y].
 * 
 * IMPORTANT:  note that the orientation of the Y axis is such that the
 * origin is in the BOTTOM-left corner.
 * 
 * Parameters:
 * 
 *   filter : (function(number(int)) : boolean) | false - a callback
 *   function that is used to filter which points are included in the
 *   list, or false to include all points
 * 
 * Return:
 * 
 *   an array of point coordinate pair arrays
 */
LilacMesh.prototype.filterVertex = function(filter) {
  
  var func_name = "filterVertex";
  var pl, p;
  var i;
  
  // Check parameter
  if (filter !== false) {
    if (typeof filter !== "function") {
      LilacMesh._fault(func_name, 100);
    }
  }
  
  // Build the filtered point list
  pl = [];
  for(i = 0; i < this._points.length; i++) {
    // Get reference to current point
    p = this._points[i];
    
    // If there is a filter function, skip this point if it is filtered
    // out
    if (filter !== false) {
      if (!filter(p.uid)) {
        continue;
      }
    }
    
    // Add this point to the filtered point list
    pl.push([p.x, p.y]);
  }
  
  // Return the filtered point list
  return pl;
};

/*
 * Given a point UID, return a copy of its coordinates.
 * 
 * The return value is an array with two normalized coordinates in range
 * [0.0, 1.0], given in order [x, y].
 * 
 * IMPORTANT:  note that the orientation of the Y axis is such that the
 * origin is in the BOTTOM-left corner.
 * 
 * A fault occurs if the given UID does not match any of the points in
 * the mesh.
 * 
 * Parameters:
 * 
 *   uid : number(int) - the UID of the point to retrieve
 * 
 * Return:
 * 
 *   an array of two normalized (x,y) coordinates for the point
 */
LilacMesh.prototype.getPoint = function(uid) {
  
  var func_name = "getPoint";
  var p;
  
  // Check parameter
  if (typeof uid !== "number") {
    LilacMesh._fault(func_name, 100);
  }
  if ((!isFinite(uid)) || (uid !== Math.floor(uid))) {
    LilacMesh._fault(func_name, 110);
  }
  
  // Find the point
  p = LilacMesh._seekPoint(this._points, uid);
  if (p === false) {
    LilacMesh._fault(func_name, 200);
  }
  
  // Get the point
  p = this._points[p];
  
  // Retrieve the coordinates
  return [p.x, p.y];
};

/*
 * Given a point UID, return a copy of its normal.
 * 
 * The return value is an array with the normalized distance and
 * normalized angle, both in range [0.0, 1.0], given in order [d, a].
 * 
 * IMPORTANT:  note that the orientation of the Y axis is such that it
 * point UPWARDS for sake of the angle.
 * 
 * A fault occurs if the given UID does not match any of the points in
 * the mesh.
 * 
 * Parameters:
 * 
 *   uid : number(int) - the UID of the point to retrieve
 * 
 * Return:
 * 
 *   an array of two normalized (d,a) values for the normal
 */
LilacMesh.prototype.getNorm = function(uid) {
  
  var func_name = "getNorm";
  var p;
  
  // Check parameter
  if (typeof uid !== "number") {
    LilacMesh._fault(func_name, 100);
  }
  if ((!isFinite(uid)) || (uid !== Math.floor(uid))) {
    LilacMesh._fault(func_name, 110);
  }
  
  // Find the point
  p = LilacMesh._seekPoint(this._points, uid);
  if (p === false) {
    LilacMesh._fault(func_name, 200);
  }
  
  // Get the point
  p = this._points[p];
  
  // Retrieve the normal
  return [p.normd, p.norma];
};

/*
 * Given a point UID, set its normalized coordinates.
 * 
 * IMPORTANT:  note that the orientation of the Y axis is such that the
 * origin is in the BOTTOM-left corner.
 * 
 * A fault occurs if the given UID does not match any of the points in
 * the mesh.
 * 
 * The coordinates can have any number value.  If they are not finite,
 * they will be changed to zero.  If they are finite, they will be
 * clamped to range [0.0, 1.0].
 * 
 * This will verify whether the new point location violates the
 * counter-clockwise orientation of any triangles the point is a part
 * of.  If it does, false is returned and the coordinates are not
 * updated.  Otherwise, true is returned and the coordinates are
 * updated.
 * 
 * Parameters:
 * 
 *   uid : number(int) - the UID of the point to retrieve
 * 
 *   nx : number - the new normalized X coordinate for the point
 * 
 *   ny : number - the new normalized Y coordinate for the point
 * 
 * Return:
 * 
 *   true if update successful, false if update was not performed
 *   because a triangle orientation would be violated
 */
LilacMesh.prototype.setPoint = function(uid, nx, ny) {
  
  var func_name = "setPoint";
  var i, k;
  var p, t;
  var a, b, c;
  
  // Check parameters
  if (typeof uid !== "number") {
    LilacMesh._fault(func_name, 100);
  }
  if ((!isFinite(uid)) || (uid !== Math.floor(uid))) {
    LilacMesh._fault(func_name, 110);
  }
  
  if ((typeof nx !== "number") || (typeof ny !== "number")) {
    LilacMesh._fault(func_name, 120);
  }
  
  // Fix coordinates if needed
  if (!isFinite(nx)) {
    nx = 0;
  }
  if (!isFinite(ny)) {
    ny = 0;
  }
  
  nx = Math.min(nx, 1);
  ny = Math.min(ny, 1);
  
  nx = Math.max(nx, 0);
  ny = Math.max(ny, 0);
  
  // Find the point
  p = LilacMesh._seekPoint(this._points, uid);
  if (p === false) {
    LilacMesh._fault(func_name, 200);
  }
  
  // Get the point
  p = this._points[p];
  
  // Go through all triangles to check orientation with new location
  for(i = 0; i < this._tris.length; i++) {
    
    // Get current triangle array
    t = this._tris[i];
    
    // Ignore this triangle if current point not in it
    if ((t[0] !== uid) && (t[1] !== uid) && (t[2] !== uid)) {
      continue;
    }
    
    // Get the index of the three vertices in the points array, except
    // set the point that matches the current point to true
    if (t[0] === uid) {
      a = true;
    } else {
      a = LilacMesh._seekPoint(this._points, t[0]);
    }
    
    if (t[1] === uid) {
      b = true;
    } else {
      b = LilacMesh._seekPoint(this._points, t[1]);
    }
    
    if (t[2] === uid) {
      c = true;
    } else {
      c = LilacMesh._seekPoint(this._points, t[2]);
    }
    
    if ((a === false) || (b === false) || (c === false)) {
      LilacMesh._fault(func_name, 300);
    }
    
    // Get the actual point records of the vertices, except for the
    // point we are updating, replace it with a new object that has the
    // X and Y coordinates set to the new coordinates
    if (a === true) {
      a = {"x": nx, "y": ny};
    } else {
      a = this._points[a];
    }
    
    if (b === true) {
      b = {"x": nx, "y": ny};
    } else {
      b = this._points[b];
    }
    
    if (c === true) {
      c = {"x": nx, "y": ny};
    } else {
      c = this._points[c];
    }
    
    // Compute the cross product (P2-P1)x(P3-P1) to make sure that the
    // Z-axis vector has a magnitude greater than zero, ensuring that
    // the points on the triangle are not colinear and that they are in
    // counter-clockwise order; since the Z coordinates of our 2D points
    // are all zero, the X-axis and Y-axis vectors of the cross product
    // will always have zero magnitude, so we just need to compute the
    // Z-axis vector, which is ((x2-x1)*(y3-y1) - (y2-y1)*(x3-x1)), and
    // make sure this is greater than zero
    k = ((b.x - a.x) * (c.y - a.y)) - ((b.y - a.y) * (c.x - a.x));

    if (!isFinite(k)) {
      // Couldn't verify orientation, so fail
      return false;
    }
    if (!(k > 0)) {
      // Orientation doesn't check out, so fail
      return false;
    }
  }
  
  // If we got here, new position is fine, so update coordinates and
  // return true and also set dirty flag
  p.x = nx;
  p.y = ny;
  this._dirty = true;
  return true;
};

/*
 * Given a point UID, set its normalized normal.
 * 
 * A fault occurs if the given UID does not match any of the points in
 * the mesh.
 * 
 * The normal coordinates can have any number value.  If they are not
 * finite, they will be changed to zero.  If they are finite, they will
 * be clamped to range [0.0, 1.0].
 * 
 * Parameters:
 * 
 *   uid : number(int) - the UID of the point to retrieve
 * 
 *   nd : number - the new normal distance for the point
 * 
 *   na : number - the new normal angle for the point
 */
LilacMesh.prototype.setNorm = function(uid, nd, na) {
  
  var func_name = "setNorm";
  var p;
  
  // Check parameters
  if (typeof uid !== "number") {
    LilacMesh._fault(func_name, 100);
  }
  if ((!isFinite(uid)) || (uid !== Math.floor(uid))) {
    LilacMesh._fault(func_name, 110);
  }
  
  if ((typeof nd !== "number") || (typeof na !== "number")) {
    LilacMesh._fault(func_name, 120);
  }
  
  // Fix coordinates if needed
  if (!isFinite(nd)) {
    nd = 0;
  }
  if (!isFinite(na)) {
    na = 0;
  }
  
  nd = Math.min(nd, 1);
  na = Math.min(na, 1);
  
  nd = Math.max(nd, 0);
  na = Math.max(na, 0);
  
  // Find the point
  p = LilacMesh._seekPoint(this._points, uid);
  if (p === false) {
    LilacMesh._fault(func_name, 200);
  }
  
  // Get the point
  p = this._points[p];
  
  // Update normal
  p.normd = nd;
  p.norma = na;
  
  // Set dirty flag
  this._dirty = true;
};

/*
 * Given normalized image coordinates, find the nearest point in the
 * mesh.
 * 
 * The return value is the uid of the nearest point, or false if there
 * are no points in the mesh.
 * 
 * IMPORTANT:  note that the orientation of the Y axis is such that the
 * origin is in the BOTTOM-left corner.
 * 
 * You can pass any number value for the parameters.  Non-finite numbers
 * will be replaced with zero, and all other numbers will be clamped to
 * range [0.0, 1.0].
 * 
 * Parameters:
 * 
 *   nx : number - the normalized image X coordinate
 * 
 *   ny : number - the normalized image Y coordinate
 * 
 * Return:
 * 
 *   the UID of the nearest point, or false if no points in mesh
 */
LilacMesh.prototype.closestPoint = function(nx, ny) {
  
  var func_name = "closestPoint";
  var nearest, nearest_len;
  var i;
  var pl;
  var xd, yd;
  
  // Check parameters and clamp
  if ((typeof nx !== "number") || (typeof ny !== "number")) {
    LilacMesh._fault(func_name, 100);
  }
  
  if (!isFinite(nx)) {
    nx = 0;
  }
  if (!isFinite(ny)) {
    ny = 0;
  }
  
  nx = Math.min(nx, 1);
  ny = Math.min(ny, 1);
  
  nx = Math.max(nx, 0);
  ny = Math.max(ny, 0);
  
  // Find the nearest point
  nearest = false;
  nearest_len = false;
  for(i = 0; i < this._points.length; i++) {
    // Compute the square of the current point distance
    xd = this._points[i].x - nx;
    yd = this._points[i].y - ny;
    pl = (xd * xd) + (yd * yd);
    
    // Update nearest if appropriate
    if (nearest === false) {
      // This is first point, so store in nearest
      nearest = this._points[i].uid;
      nearest_len = pl;
      
    } else {
      // Not first point, so compare to current nearest distance
      if (pl < nearest_len) {
        // Closer, so store this point
        nearest = this._points[i].uid;
        nearest_len = pl;
      }
    }
  }
  
  // Return the search result
  return nearest;
};

/*
 * Add an "independent" triangle to the mesh that has all-new points.
 * 
 * Each vertex specified will be created as a new point, and there will
 * be no points shared with any existing triangles.
 * 
 * pa is an array of exactly three point arrays.  Each point array is an
 * array of two normalized point locations in [x, y] order, with Y
 * oriented around the BOTTOM-left corner.
 * 
 * The new points will always be added so that the first point in the
 * provided point array has the lowest UID and the third point in the
 * provided point array has the highest UID.
 * 
 * If the provided points are in clockwise orientation, this function
 * will automatically flip the triangle definition so that it is in
 * counter-clockwise orientation (but the point UIDs still have the
 * property given above).  However, if the points are colinear, this
 * function will fail, not add the triangle, and return false.
 * 
 * The normals of the new points will all be set to zero.
 * 
 * If the function is successful, the return value is an array of three
 * UID values specifying the UID of each vertex of the new triangle in
 * ascending order of UID.
 * 
 * The function will also fail in the unlikely event that we have run
 * out of UID numbers.
 * 
 * Parameters:
 * 
 *   pa : Array - array of three point-pair arrays specifying the
 *   vertices
 * 
 * Return:
 * 
 *   an array of three UID in ascending order if successful, false if
 *   points were colinear and no triangle could be added (or if we ran
 *   out of UID numbers)
 */
LilacMesh.prototype.addIndependent = function(pa) {
  
  var func_name = "addIndependent";
  var i, j, k;
  var should_flip;
  var result;
  var base_uid;
  
  // Check parameter
  if ((typeof pa !== "object") || (!(pa instanceof Array))) {
    LilacMesh._fault(func_name, 100);
  }
  if (pa.length !== 3) {
    LilacMesh._fault(func_name, 110);
  }
  
  for(i = 0; i < pa.length; i++) {
    if ((typeof pa[i] !== "object") || (!(pa[i] instanceof Array))) {
      LilacMesh._fault(func_name, 120);
    }
    if (pa[i].length !== 2) {
      LilacMesh._fault(func_name, 130);
    }
    for(j = 0; j < pa[i].length; j++) {
      if (typeof pa[i][j] !== "number") {
        LilacMesh._fault(func_name, 140);
      }
      if (!isFinite(pa[i][j])) {
        LilacMesh._fault(func_name, 150);
      }
      if (!((pa[i][j] >= 0) && (pa[i][j] <= 1))) {
        LilacMesh._fault(func_name, 160);
      }
    }
  }
  
  // Compute the cross product (P2-P1)x(P3-P1) to get the Z-axis vector
  // magnitude; since the Z coordinates of our 2D points are all zero,
  // the X-axis and Y-axis vectors of the cross product will always have
  // zero magnitude, so we just need to compute the Z-axis vector, which
  // is ((x2-x1)*(y3-y1) - (y2-y1)*(x3-x1))
  k = ((pa[1][0] - pa[0][0]) * (pa[2][1] - pa[0][1])) -
        ((pa[1][1] - pa[0][1]) * (pa[2][0] - pa[0][0]));
  
  // If result is not finite, return false
  if (!isFinite(k)) {
    return false;
  }
  
  // If result is greater than zero, no need to flip points; if result
  // is less than zero, points need to be flipped; if result is zero,
  // fail because colinear
  if (k > 0) {
    should_flip = false;
  
  } else if (k < 0) {
    should_flip = true;
  
  } else if (k === 0) {
    return false;
    
  } else {
    // Shouldn't happen
    LilacMesh._fault(200);
  }
  
  // If points array currently empty, base UID is one; else, base UID is
  // one greater than the UID of the last point in the points array
  if (this._points.length < 1) {
    base_uid = 1;
  } else {
    base_uid = this._points[this._points.length - 1].uid + 1;
  }
  
  // We be able to define UID two beyond base so that we have three new
  // UID, else fail due to lack of UID
  if (base_uid + 2 > LilacMesh.MAX_POINT_ID) {
    return false;
  }
  
  // OK, we can define the points now, so add them to the points array
  this._points.push({
    "uid": base_uid,
    "normd": 0,
    "norma": 0,
    "x": pa[0][0],
    "y": pa[0][1]
  });
  
  this._points.push({
    "uid": base_uid + 1,
    "normd": 0,
    "norma": 0,
    "x": pa[1][0],
    "y": pa[1][1]
  });
  
  this._points.push({
    "uid": base_uid + 2,
    "normd": 0,
    "norma": 0,
    "x": pa[2][0],
    "y": pa[2][1]
  });
  
  // Add a triangle, obeying the should_flip setting we determined
  if (should_flip) {
    this._insertTri([
      base_uid, base_uid + 2, base_uid + 1
    ]);
    
  } else {
    this._insertTri([
      base_uid, base_uid + 1, base_uid + 2
    ]);
  }
  
  // Set dirty flag
  this._dirty = true;
  
  // Return the UID array, always in ascending UID order
  return [
    base_uid, base_uid + 1, base_uid + 2
  ];
};

/*
 * Add a "pivot" triangle to the mesh that uses one existing point but
 * shares no edges and adds two new points.
 * 
 * pivot is the UID of an existing point that will be the "pivot" point
 * shared with another triangle.
 * 
 * pn is an array of exactly two point arrays.  Each point array is an
 * array of two normalized point locations in [x, y] order, with Y
 * oriented around the BOTTOM-left corner.
 * 
 * The new points will always be added so that the first point in the
 * provided point array has the lower UID and the second point in the
 * provided point array has the higher UID.  The existing point will
 * always have the lowest UID, of course.
 * 
 * If the existing point plus the two provided points are in clockwise
 * orientation, this function will automatically flip the triangle
 * definition so that it is in counter-clockwise orientation (but the
 * point UIDs still have the property given above).  However, if the
 * points are colinear, this function will fail, not add the triangle or
 * the new points, and return false.
 * 
 * The normals of the new points will all be set to zero.
 * 
 * If the function is successful, the return value is an array of three
 * UID values specifying the UID of each vertex of the new triangle in
 * ascending order of UID, with the first UID being the existing point.
 * 
 * The function will also fail in the unlikely event that we have run
 * out of UID numbers.
 * 
 * Parameters:
 * 
 *   pivot : number(int) - the UID of an existing point
 * 
 *   pn : Array - array of two point-pair arrays specifying the new
 *   vertices
 * 
 * Return:
 * 
 *   an array of three UID in ascending order if successful, false if
 *   points were colinear and no triangle could be added (or if we ran
 *   out of UID numbers)
 */
LilacMesh.prototype.addPivot = function(pivot, pn) {
  
  var func_name = "addPivot";
  var p;
  var i, j, k;
  var should_flip;
  var result;
  var base_uid;
  
  // Check parameters
  if ((typeof pivot !== "number") || (!isFinite(pivot)) ||
      (Math.floor(pivot) !== pivot) || (pivot < 1) ||
      (pivot > LilacMesh.MAX_POINT_ID)) {
    LilacMesh._fault(func_name, 50);
  }
  
  if ((typeof pn !== "object") || (!(pn instanceof Array))) {
    LilacMesh._fault(func_name, 100);
  }
  if (pn.length !== 2) {
    LilacMesh._fault(func_name, 110);
  }
  
  for(i = 0; i < pn.length; i++) {
    if ((typeof pn[i] !== "object") || (!(pn[i] instanceof Array))) {
      LilacMesh._fault(func_name, 120);
    }
    if (pn[i].length !== 2) {
      LilacMesh._fault(func_name, 130);
    }
    for(j = 0; j < pn[i].length; j++) {
      if (typeof pn[i][j] !== "number") {
        LilacMesh._fault(func_name, 140);
      }
      if (!isFinite(pn[i][j])) {
        LilacMesh._fault(func_name, 150);
      }
      if (!((pn[i][j] >= 0) && (pn[i][j] <= 1))) {
        LilacMesh._fault(func_name, 160);
      }
    }
  }
  
  // Get the pivot point
  p = LilacMesh._seekPoint(this._points, pivot);
  if (p === false) {
    LilacMesh._fault(func_name, 170);
  }
  
  p = this._points[p];
  
  // Compute the cross product (P2-P1)x(P3-P1) to get the Z-axis vector
  // magnitude; since the Z coordinates of our 2D points are all zero,
  // the X-axis and Y-axis vectors of the cross product will always have
  // zero magnitude, so we just need to compute the Z-axis vector, which
  // is ((x2-x1)*(y3-y1) - (y2-y1)*(x3-x1))
  k = ((pn[0][0] - p.x) * (pn[1][1] - p.y)) -
        ((pn[0][1] - p.y) * (pn[1][0] - p.x));
  
  // If result is not finite, return false
  if (!isFinite(k)) {
    return false;
  }
  
  // If result is greater than zero, no need to flip points; if result
  // is less than zero, points need to be flipped; if result is zero,
  // fail because colinear
  if (k > 0) {
    should_flip = false;
  
  } else if (k < 0) {
    should_flip = true;
  
  } else if (k === 0) {
    return false;
    
  } else {
    // Shouldn't happen
    LilacMesh._fault(200);
  }
  
  // If points array currently empty, base UID is one; else, base UID is
  // one greater than the UID of the last point in the points array
  if (this._points.length < 1) {
    base_uid = 1;
  } else {
    base_uid = this._points[this._points.length - 1].uid + 1;
  }
  
  // We be able to define UID one beyond base so that we have two new
  // UID, else fail due to lack of UID
  if (base_uid + 1 > LilacMesh.MAX_POINT_ID) {
    return false;
  }
  
  // OK, we can define the points now, so add them to the points array
  this._points.push({
    "uid": base_uid,
    "normd": 0,
    "norma": 0,
    "x": pn[0][0],
    "y": pn[0][1]
  });
  
  this._points.push({
    "uid": base_uid + 1,
    "normd": 0,
    "norma": 0,
    "x": pn[1][0],
    "y": pn[1][1]
  });
  
  // Add a triangle, obeying the should_flip setting we determined
  if (should_flip) {
    this._insertTri([
      pivot, base_uid + 1, base_uid
    ]);
    
  } else {
    this._insertTri([
      pivot, base_uid, base_uid + 1
    ]);
  }
  
  // Set dirty flag
  this._dirty = true;
  
  // Return the UID array, always in ascending UID order
  return [
    pivot, base_uid, base_uid + 1
  ];
};

/*
 * Add an "extension" triangle to the mesh that uses two existing
 * points and one new point, therefore sharing one edge with another
 * triangle.
 * 
 * ep1 and ep2 are the UIDs of two existing points.  They must not be
 * the same.
 * 
 * (nx, ny) defines the normalized point location of the new point, with
 * Y oriented around the BOTTOM-left corner.
 * 
 * The points will be reordered to be in counter-clockwise orientation
 * with the UID of the lowest numeric value first.  If the points are
 * colinear, this function will fail, not add the triangle or the new
 * point, and return false.
 * 
 * This function will also check that the ordered edge, after the
 * triangle has been correctly oriented, is not used in any existing
 * triangle.  If it is, this function will fail, not add the triangle or
 * the new point, and return false.
 * 
 * The normal of the new point will be set to zero.
 * 
 * If the function is successful, the return value is an array of three
 * UID values specifying the UID of each vertex of the new triangle in
 * ascending order of UID, with the first two UIDs being the existing
 * points and the third UID being the new point.
 * 
 * The function will also fail in the unlikely event that we have run
 * out of UID numbers.
 * 
 * Parameters:
 * 
 *   ep1 : number(int) - the UID of an existing point
 * 
 *   ep2 : number(int) - the UID of another existing point
 * 
 *   nx : number - the normalized X coordinate of the new point
 * 
 *   ny : number - the normalized Y coordinate of the new point
 * 
 * Return:
 * 
 *   an array of three UID in ascending order if successful, false if
 *   points were colinear and no triangle could be added, or if the
 *   oriented shared edge is not unique, or if we ran out of UID
 *   numbers
 */
LilacMesh.prototype.addExtend = function(ep1, ep2, nx, ny) {
  
  var func_name = "addExtend";
  var p1, p2;
  var i, k, t;
  var ip1, ip2;
  var should_flip;
  var result;
  var base_uid;
  
  // Check parameters
  if ((typeof ep1 !== "number") || (typeof ep2 !== "number") ||
      (!isFinite(ep1)) || (!isFinite(ep2)) ||
      (Math.floor(ep1) !== ep1) || (Math.floor(ep2) !== ep2) ||
      (ep1 < 1) || (ep2 < 1) ||
      (ep1 > LilacMesh.MAX_POINT_ID) ||
      (ep2 > LilacMesh.MAX_POINT_ID)) {
    LilacMesh._fault(func_name, 50);
  }
  
  if (ep1 === ep2) {
    LilacMesh._fault(func_name, 75);
  }
  
  if ((typeof nx !== "number") || (typeof ny !== "number") ||
      (!isFinite(nx)) || (!isFinite(ny)) ||
      (!((nx >= 0) && (nx <= 1))) ||
      (!((ny >= 0) && (ny <= 1)))) {
    LilacMesh._fault(func_name, 100);
  }
  
  // Re-order ep1 and ep2 if necessary so that ep1 has the lower UID
  if (ep1 > ep2) {
    p1 = ep1;
    ep1 = ep2;
    ep2 = p1;
  }
  
  // Get the existing points
  p1 = LilacMesh._seekPoint(this._points, ep1);
  p2 = LilacMesh._seekPoint(this._points, ep2);
  
  if ((p1 === false) || (p2 === false)) {
    LilacMesh._fault(func_name, 150);
  }
  
  p1 = this._points[p1];
  p2 = this._points[p2];
  
  // Compute the cross product (P2-P1)x(P3-P1) to get the Z-axis vector
  // magnitude; since the Z coordinates of our 2D points are all zero,
  // the X-axis and Y-axis vectors of the cross product will always have
  // zero magnitude, so we just need to compute the Z-axis vector, which
  // is ((x2-x1)*(y3-y1) - (y2-y1)*(x3-x1))
  k = ((p2.x - p1.x) * (ny - p1.y)) - ((p2.y - p1.y) * (nx - p1.x));
  
  // If result is not finite, return false
  if (!isFinite(k)) {
    return false;
  }
  
  // If result is greater than zero, no need to flip points; if result
  // is less than zero, points need to be flipped; if result is zero,
  // fail because colinear
  if (k > 0) {
    should_flip = false;
  
  } else if (k < 0) {
    should_flip = true;
  
  } else if (k === 0) {
    return false;
    
  } else {
    // Shouldn't happen
    LilacMesh._fault(200);
  }
  
  // Determine the ordered edge of the two existing points
  if (should_flip) {
    ip1 = ep2;
    ip2 = ep1;
  } else {
    ip1 = ep1;
    ip2 = ep2;
  }
  
  // Verify that no existing triangle already has the ordered edge from
  // the two existing points
  for(i = 0; i < this._tris.length; i++) {
    t = this._tris[i];
    
    if (((ip1 === t[0]) && (ip2 === t[1])) ||
        ((ip1 === t[1]) && (ip2 === t[2])) ||
        ((ip1 === t[2]) && (ip2 === t[0]))) {
      return false;
    }
  }
  
  // If points array currently empty, base UID is one; else, base UID is
  // one greater than the UID of the last point in the points array
  if (this._points.length < 1) {
    base_uid = 1;
  } else {
    base_uid = this._points[this._points.length - 1].uid + 1;
  }
  
  // Check that base UID does not exceed maximum point ID
  if (base_uid > LilacMesh.MAX_POINT_ID) {
    return false;
  }
  
  // OK, we can define the new point now, so add it to the points array
  this._points.push({
    "uid": base_uid,
    "normd": 0,
    "norma": 0,
    "x": nx,
    "y": ny
  });
  
  // Add a triangle, obeying the should_flip setting we determined
  if (should_flip) {
    this._insertTri([
      ep1, base_uid, ep2
    ]);
    
  } else {
    this._insertTri([
      ep1, ep2, base_uid
    ]);
  }
  
  // Set the dirty flag
  this._dirty = true;
  
  // Return the UID array, always in ascending UID order
  return [
    ep1, ep2, base_uid
  ];
};

/*
 * Add a "fill" triangle to the mesh that uses three existing points.
 * 
 * v1, v2, and v3 are the UIDs of three existing points.  No two point
 * UIDs may be equal.
 * 
 * The points will be reordered to be in counter-clockwise orientation
 * with the UID of the lowest numeric value first.  If the points are
 * colinear, this function will fail, not add the triangle, and return
 * false.
 * 
 * This function will also check that the triangle is not already
 * present in the mesh, after the triangle has been correctly oriented.
 * If it is already present, this function will fail, not add the
 * duplicate triangle, and return false.
 * 
 * Parameters:
 * 
 *   v1 : number(int) - the UID of the first vertex
 * 
 *   v2 : number(int) - the UID of the second vertex
 * 
 *   v3 : number(int) - the UID of the second vertex
 * 
 * Return:
 * 
 *   true if new triangle successfully added, false otherwise
 */
LilacMesh.prototype.addFill = function(v1, v2, v3) {
  
  var func_name = "addFill";
  var x, k, t, i;
  var p1, p2, p3;
  
  // Check parameters
  if ((typeof v1 !== "number") ||
      (typeof v2 !== "number") ||
      (typeof v3 !== "number") ||
      (!isFinite(v1)) ||
      (!isFinite(v2)) ||
      (!isFinite(v3)) ||
      (Math.floor(v1) !== v1) ||
      (Math.floor(v2) !== v2) ||
      (Math.floor(v3) !== v3) ||
      (v1 < 1) ||
      (v2 < 1) ||
      (v3 < 1) ||
      (v1 > LilacMesh.MAX_POINT_ID) ||
      (v2 > LilacMesh.MAX_POINT_ID) ||
      (v3 > LilacMesh.MAX_POINT_ID)) {
    LilacMesh._fault(func_name, 50);
  }
  
  if ((v1 === v2) || (v2 === v3) || (v1 === v3)) {
    LilacMesh._fault(func_name, 75);
  }
  
  // Re-order vertices if necessary so that the vertex with the lowest
  // UID value is first
  if (v3 < v2) {
    x = v2;
    v2 = v3;
    v3 = x;
  }
  if (v2 < v1) {
    x = v1;
    v1 = v2;
    v2 = x;
  }
  
  // Get the existing points
  p1 = LilacMesh._seekPoint(this._points, v1);
  p2 = LilacMesh._seekPoint(this._points, v2);
  p3 = LilacMesh._seekPoint(this._points, v3);
  
  if ((p1 === false) || (p2 === false) || (p3 === false)) {
    LilacMesh._fault(func_name, 150);
  }
  
  p1 = this._points[p1];
  p2 = this._points[p2];
  p3 = this._points[p3];
  
  // Compute the cross product (P2-P1)x(P3-P1) to get the Z-axis vector
  // magnitude; since the Z coordinates of our 2D points are all zero,
  // the X-axis and Y-axis vectors of the cross product will always have
  // zero magnitude, so we just need to compute the Z-axis vector, which
  // is ((x2-x1)*(y3-y1) - (y2-y1)*(x3-x1))
  k = ((p2.x - p1.x) * (p3.y - p1.y)) - ((p2.y - p1.y) * (p3.x - p1.x));
  
  // If result is not finite, return false
  if (!isFinite(k)) {
    return false;
  }
  
  // If result is less than zero, exchange second and third vertices; if
  // result is zero, fail because colinear
  if (k < 0) {
    x = p2;
    p2 = p3;
    p3 = x;
    
    x = v2;
    v2 = v3;
    v3 = x;
  
  } else if (k === 0) {
    return false;
  }
  
  // Verify that triangle not already in mesh
  for(i = 0; i < this._tris.length; i++) {
    // Get current triangle
    t = this._tris[i];
    
    // Fail if current triangle equal to new triangle
    if ((v1 === t[0]) && (v2 === t[1]) && (v3 === t[2])) {
      return false;
    }
  }
  
  // If we got here, add the new triangle and return true, and also set
  // dirty flag
  this._insertTri([v1, v2, v3]);
  this._dirty = true;
  return true;
};

/*
 * Drop an existing triangle from a mesh given its vertices.
 * 
 * v1, v2, and v3 are the UIDs of the triangle to look for.  No two
 * point UIDs may be equal.  The UIDs may be in any order, however.
 * 
 * If a triangle is dropped, this function will also check for orphaned
 * points and release any points that are no longer referenced from any
 * triangles.
 * 
 * If the given triangle does not exist in the list, this call is
 * ignored.
 * 
 * Parameters:
 * 
 *   v1 : number(int) - the UID of the first vertex
 * 
 *   v2 : number(int) - the UID of the second vertex
 * 
 *   v3 : number(int) - the UID of the second vertex
 */
LilacMesh.prototype.dropTriangle = function(v1, v2, v3) {
  
  var func_name = "dropTriangle";
  var pa, pb, pu;
  var i, j, t, k;
  
  // Check parameters
  if ((typeof v1 !== "number") ||
      (typeof v2 !== "number") ||
      (typeof v3 !== "number") ||
      (!isFinite(v1)) ||
      (!isFinite(v2)) ||
      (!isFinite(v3)) ||
      (Math.floor(v1) !== v1) ||
      (Math.floor(v2) !== v2) ||
      (Math.floor(v3) !== v3) ||
      (v1 < 1) ||
      (v2 < 1) ||
      (v3 < 1) ||
      (v1 > LilacMesh.MAX_POINT_ID) ||
      (v2 > LilacMesh.MAX_POINT_ID) ||
      (v3 > LilacMesh.MAX_POINT_ID)) {
    LilacMesh._fault(func_name, 50);
  }
  
  if ((v1 === v2) || (v2 === v3) || (v1 === v3)) {
    LilacMesh._fault(func_name, 75);
  }
  
  // Put all the points in an array and sort the array by UID
  pa = [v1, v2, v3];
  pa.sort(LilacMesh._numericCmp);
  
  // Initialize point-used array with false values
  pu = [false, false, false];
  
  // Scan the triangle list
  j = false;
  for(i = 0; i < this._tris.length; i++) {
    // Get current triangle
    t = this._tris[i];
    
    // Put the current vertices in an array and sort by UID
    pb = [t[0], t[1], t[2]];
    pb.sort(LilacMesh._numericCmp);
    
    // Check whether current triangle is a match
    if ((pb[0] === pa[0]) && (pb[1] === pa[1]) &&
        (pb[2] === pa[2])) {
      // Match, so set j to the index of this triangle
      j = i;
      
    } else {
      // Not a match, so see if any of our points are in use and update
      // point-use list appropriately
      for(k = 0; k < 3; k++) {
        if ((pa[k] === pb[0]) ||
            (pa[k] === pb[1]) ||
            (pa[k] === pb[2])) {
          pu[k] = true;
        }
      }
    }
  }
  
  // Only proceed if we found the triangle to drop
  if (j !== false) {
    // Remove triangle from list
    if (j >= this._tris.length - 1) {
      // Triangle is last element in list, so just pop it from end of
      // list
      this._tris.pop();
      
    } else {
      // Triangle is not last element in list, so starting at element
      // and going up to and including second to last element, shift
      // everything left
      for(i = j; i < this._tris.length - 1; i++) {
        this._tris[i] = this._tris[i + 1];
      }
      
      // Pop the last element from the list, which is now a duplicate
      this._tris.pop();
    }
    
    // Drop any points that are no longer used from the point list
    for(k = 0; k < 3; k++) {
      // Skip current point if it is still used
      if (pu[k]) {
        continue;
      }
      
      // Point is not used, so find its index in point list
      j = LilacMesh._seekPoint(this._points, pa[k]);
      if (j === false) {
        LilacMesh._fault(func_name, 200);
      }
      
      // Drop point from point list
      if (j >= this._points.length - 1) {
        // Point is last point in list, so pop
        this._points.pop();
      
      } else {
        // Point is not last point in list, so shift everything from
        // index to second-to-last point left
        for(i = j; i < this._points.length - 1; i++) {
          this._points[i] = this._points[i + 1];
        }
        
        // Pop the last point from the list, which is now a duplicate
        this._points.pop();
      }
    }
    
    // Set dirty flag
    this._dirty = true;
  }
};

/*
 * Check whether the mesh is "dirty".
 * 
 * The dirty flag is an internal flag.  You can explicitly set it and
 * clear it with the clearDirty and setDirty functions, though the flag
 * also gets automatically set and cleared in certain cases described
 * below.
 * 
 * After construction, the initial state of the dirty flag is cleared.
 * The dirty flag is always cleared after "fromJSON" deserializes a new
 * mesh state, because this is presumed to be loading from an existing
 * file.  The dirty flag will be automatically set whenever a public
 * function (besides fromJSON) changes the state of the mesh.
 * 
 * The dirty flag is intended to track whether there are unsaved changes
 * to the mesh.
 * 
 * Return:
 * 
 *   true if dirty flag is set for the mesh, false otherwise
 */
LilacMesh.prototype.isDirty = function() {
  return this._dirty;
};

/*
 * Explicitly set the dirty flag.
 * 
 * See "isDirty()" for further information.
 */
LilacMesh.prototype.clearDirty = function() {
  this._dirty = false;
};

/*
 * Explicitly clear the dirty flag.
 * 
 * See "isDirty()" for further information.
 */
LilacMesh.prototype.setDirty = function() {
  this._dirty = true;
};
