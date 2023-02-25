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
 * no triangles defined.
 */
function LilacMesh() {
  this._points = [];
  this._tris = [];
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
  pa.sort();
  
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
  // @@TODO:
  console.log("toJSON");
  return "{}";
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
}
