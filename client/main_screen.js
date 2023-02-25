"use strict";

/*
 * main_screen.js
 * ==============
 * 
 * Module for handling the main screen of the Lilac Mesh Editor.
 */

// Wrap everything in an anonymous function that we immediately invoke
// after it is declared -- this prevents anything from being implicitly
// added to global scope
(function() {
  
  /*
   * Local constants
   * ===============
   */
  
  /*
   * Constants controlling how overlay is displayed:
   *
   *   OVERLAY_LINE_WIDTH: width of the line
   *   OVERLAY_LINE_COLOR: CSS color string specifying color of line
   *   OVERLAY_NORMAL_WIDTH : width of normal lines
   *   OVERLAY_NORMAL_COLOR : CSS color string specifying normal color
   *   OVERLAY_NORMAL_LENGTH : length of normal lines
   *   OVERLAY_UNSEL_COLOR: CSS color string for unselected points
   *   OVERLAY_SEL_COLOR: CSS color string for selected points
   *   OVERLAY_PT_WIDTH: the width of a point square
   *   OVERLAY_FILL_COLOR: CSS color string for filling triangles
   *   OVERLAY_HITBOX_DIM_HALF: half the pixel dimension of point hitbox
   */
  var OVERLAY_LINE_WIDTH = 2;
  var OVERLAY_LINE_COLOR = "blue";
  var OVERLAY_NORMAL_WIDTH = 2;
  var OVERLAY_NORMAL_COLOR = "green";
  var OVERLAY_NORMAL_LENGTH = 32;
  var OVERLAY_UNSEL_COLOR = "black";
  var OVERLAY_SEL_COLOR = "red";
  var OVERLAY_PT_WIDTH = 8;
  var OVERLAY_FILL_COLOR = "blue";
  var OVERLAY_HITBOX_DIM_HALF = 6;
  
  /*
   * Constants controlling how the normal scope canvas is displayed:
   * 
   *   NSC_LINE_WIDTH: width of the axis lines
   *   NSC_CIRCLE_WIDTH: width of the scope circle line
   *   NSC_CIRCLE_R: radius of the scope circle
   *   NSC_PT_WIDTH: the width of a normal point square
   *   NSC_PT_COLOR: CSS color string for the normal point
   *   NSC_RAY_WIDTH: width of ray line from origin to normal point
   *   NSC_RAY_COLOR: CSS color string for the ray line
   */
  var NSC_LINE_WIDTH = 2;
  var NSC_CIRCLE_WIDTH = 2;
  var NSC_CIRCLE_R = 25;
  var NSC_PT_WIDTH = 8;
  var NSC_PT_COLOR = "red";
  var NSC_RAY_WIDTH = 2;
  var NSC_RAY_COLOR = "blue";

  /*
   * Local data
   * ==========
   */
  
  /*
   * The main canvas element on the main page.
   */
  var m_canvas = false;
  
  /*
   * The "normal scope" canvas used for adjusting the normals.
   */
  var m_nscope = false;
  
  /*
   * The <img> element holding the trace image.
   */
  var m_trace = false;
  
  /*
   * The LilacMesh object.
   */
  var m_mesh = false;
  
  /*
   * The CanvasView object.
   */
  var m_view = false;
  
  /*
   * An array of integer UID values for selected pixels, sorted in
   * ascending order of integer value with no duplicates.
   */
  var m_psel = [];
  
  /*
   * An array of newly added points that are not in the mesh yet.
   * 
   * All of these points are treated as if they are selected points, but
   * they are not yet in a triangle.  This is when defining a new
   * triangle but not all the points are available yet.
   * 
   * Each element of this array is a point, which is an array of two
   * normalized coordinates.
   */
  var m_npts = [];
  
  /*
   * When using the hand tool, these variables store where the hand tool
   * was last pressed down.
   * 
   * The boolean flag indicates whether a value is currently stored
   * here.
   */
  var m_hand_captured = false;
  var m_hand_last_x = false;
  var m_hand_last_y = false;
  
  /*
   * Local functions
   * ===============
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
  function fault(func_name, loc) {
    
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
                  " in main_screen");
    
    // Throw exception
    throw ("main_screen:" + func_name + ":" + String(loc));
  }
  
  /*
   * Given the unique ID number of a point, locate that point within the
   * selected points array.
   * 
   * false is returned if no selected point has that uid.  Otherwise,
   * the return value is the index of the point within m_psel.
   * 
   * Parameters:
   * 
   *   uid : number(int) - the point to check for
   * 
   * Return:
   * 
   *   the index of the point record in m_psel, or false if no selected
   *   point has given uid
   */
  function seek_sel(uid) {
    
    var func_name = "seek_sel";
    var lbound;
    var ubound;
    var mid;
    var midv;
    
    // Check parameter
    if (typeof uid !== "number") {
      fault(func_name, 100);
    }
    uid = Math.floor(uid);
    if (!isFinite(uid)) {
      fault(func_name, 150);
    }
    
    // If uid is out of allowed range, always return false
    if ((uid < 1) || (uid > LilacMesh.MAX_POINT_ID)) {
      return false;
    }
    
    // If selected array is empty, always return false
    if (m_psel.length < 1) {
      return false;
    }
    
    // Perform a binary search for the point
    lbound = 0;
    ubound = m_psel.length - 1;
    while (lbound < ubound) {
      // Get midpoint
      mid = lbound + Math.floor((ubound - lbound) / 2);
      
      // Make sure midpoint at least one above lower bound
      if (mid <= lbound) {
        mid = lbound + 1;
      }
      
      // Get midpoint value
      midv = m_psel[mid];
      
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
        fault(func_name, 200);
      }
    }
    
    // Return the index if we found the record, else return false
    if (m_psel[lbound] === uid) {
      return lbound;
    } else {
      return false;
    }
  }
  
  /*
   * Given the unique ID number of a point, check whether the point is
   * unselected.
   * 
   * This is used as a filter function for drawing vertices.  It is
   * intended as a callback for LilacMesh.filterVertex().
   * 
   * Parameters:
   * 
   *   uid : number(int) - the point to check for
   * 
   * Return:
   * 
   *   true if point is NOT in the selected points list, false if it is
   */
  function isUidUnsel(uid) {
    var is_sel;
    
    // Check whether selected
    is_sel = seek_sel(uid);
    
    // Return result
    if (is_sel === false) {
      return true;
    } else {
      return false;
    }
  }
  
  /*
   * Public functions
   * ================
   */
  
  /*
   * Register the canvas elements on the main form with this module.
   * 
   * You should call this during start-up.  You must call it before
   * using the other functions.
   * 
   * Parameters:
   * 
   *   cnv : HTMLCanvasElement - the main canvas on the main page
   * 
   *   nscope : HTMLCanvasElement - the normal adjustment canvas on the
   *   main page (only displayed when the normal tool is active)
   */
  function storeCanvas(cnv, nscope) {
    
    var func_name = "storeCanvas";
    
    // Check parameters
    if ((typeof cnv !== "object") || (typeof nscope !== "object")) {
      fault(func_name, 100);
    }
    if ((!(cnv instanceof HTMLCanvasElement)) ||
        (!(nscope instanceof HTMLCanvasElement))) {
      fault(func_name, 200);
    }
    
    // Store the canvas elements
    m_canvas = cnv;
    m_nscope = nscope;
  }
  
  /*
   * Flush any state specific to a mode.
   * 
   * This clears the selected points, drops any points that may be in
   * the new points array (and not yet added to the mesh), clears hand
   * tool state, and redraws.
   */
  function flushMode() {
    
    m_psel = [];
    m_npts = [];
    
    m_hand_captured = false;
    m_hand_last_x = false;
    m_hand_last_y = false;
    
    redraw();
  }
  
  /*
   * Event handler for pointer events on the normal adjustment scope.
   * 
   * This should be called whenever the pointer device is pushed down on
   * the normal adjustment canvas and whenever it is dragged around with
   * a button pressed down.  This call will be ignored if the main div
   * is not currently being displayed or if the normal adjustment tool
   * is not currently active or if not exactly one point is selected.
   * 
   * The caller should capture the mouse whenever it is pressed down on
   * the normal scope, and report subsequent motions until it is
   * released to this function.
   * 
   * (cx, cy) are the coordinates of the pointer device location ***in
   * the pixel coordinate space of the canvas***.  The coordinates do
   * not actually have to lie within the canvas, but they have to be
   * transformed properly into the pixel coordinate space of the canvas.
   * 
   * Parameters:
   * 
   *   cx : number - the X coordinate of the event in the pixel
   *   coordinate space of the normal scope canvas
   * 
   *   cy : number - the Y coordinate of the event in the pixel
   *   coordinate space of the normal scope canvas
   */
  function handlePointerNormal(cx, cy) {
    
    var func_name = "handlePointerNormal";
    var cd, ca;
    
    // Ignore if not being displayed
    if (lilac_mesh_html.currentDiv() !== "main") {
      return;
    }
    
    // Ignore if not in normal mode
    if (lilac_mesh_html.getClickMode() !== "normal") {
      return;
    }
    
    // Ignore if not exactly one point selected
    if (m_psel.length !== 1) {
      return;
    }
   
    // Check that local state is active
    if ((m_nscope === false) || (m_mesh === false)) {
      fault(func_name, 50);
    }
    
    // Check parameters
    if ((typeof cx !== "number") || (typeof cy !== "number")) {
      fault(func_name, 100);
    }
    
    // Change non-finite values to zero
    if (!isFinite(cx)) {
      cx = 0;
    }
    if (!isFinite(cy)) {
      cy = 0;
    }
    
    // Transform coordinates so that origin of scope circle is (0, 0)
    cx = cx - (m_nscope.width / 2);
    cy = cy - (m_nscope.height / 2);
    
    // Divide by radius of drawn scope circle to get in unit circle
    // space
    cx = cx / NSC_CIRCLE_R;
    cy = cy / NSC_CIRCLE_R;
    
    // Invert Y coordinate so Y axis is oriented UPWARDS
    cy = -(cy);
    
    // Compute the normalized polar coordinates
    if ((cx === 0) && (cy === 0)) {
      // Special case at origin
      cd = 0;
      ca = 0;
      
    } else {
      // Not at origin, so use general case
      ca = Math.atan2(cy, cx);
      cd = Math.sqrt((cx * cx) + (cy * cy));
      
      // Convert negative angles to positive space 
      if (ca < 0) {
        ca = ca + (2 * Math.PI);
      }
      
      // Convert angle to normalized range and clamp
      ca = ca / (2 * Math.PI);
      ca = Math.min(ca, 1);
      ca = Math.max(ca, 0);
      
      // Clamp to normalized distance
      if (cd <= 0) {
        ca = 0;
        cd = 0;
      } else {
        cd = Math.min(cd, 1);
      }
    }
    
    // Update the normal of the point and redraw
    m_mesh.setNorm(m_psel[0], cd, ca);
    redraw();
  }
  
  /*
   * Event handler for pointer down events.
   * 
   * This should be called whenever the pointer device is pushed down on
   * the canvas element.  This call will be ignored and return false if
   * the main div is not currently being displayed.
   * 
   * (cx, cy) are the coordinates of the pointer device location ***in
   * the pixel coordinate space of the canvas***.  The coordinates do
   * not actually have to lie within the canvas, but they have to be
   * transformed properly into the pixel coordinate space of the canvas.
   * 
   * The return value of this function is a boolean indicating whether
   * or not to capture the pointer.  If false is returned, then no
   * movement or release events after this one should be reported, and
   * only call this event handler back when the next pointer down event
   * occurs.  If true is returned, then the caller should capture the
   * pointer, call handlePointerDrag() for movement events while the
   * pointer remains down, and release the capture and call
   * handlePointerRelease() when the pointer is released.
   * 
   * Parameters:
   * 
   *   cx : number - the X coordinate of the event in the pixel
   *   coordinate space of the canvas
   * 
   *   cy : number - the Y coordinate of the event in the pixel
   *   coordinate space of the canvas
   * 
   * Return:
   * 
   *   true if capture should be invoked, false if no capture required
   */
  function handlePointerDown(cx, cy) {
    
    var func_name = "handlePointerDown";
    var m;
    var nearest, p, px, py;
    var r;
    
    // Ignore if not being displayed
    if (lilac_mesh_html.currentDiv() !== "main") {
      return;
    }
    
    // Check that local state is active
    if ((m_canvas === false) || (m_trace === false) ||
        (m_mesh === false) || (m_view === false)) {
      fault(func_name, 50);
    }
    
    // Check parameters
    if ((typeof cx !== "number") || (typeof cy !== "number")) {
      fault(func_name, 100);
    }
    
    // Change non-finite values to zero
    if (!isFinite(cx)) {
      cx = 0;
    }
    if (!isFinite(cy)) {
      cy = 0;
    }
    
    // Handle different modes
    m = lilac_mesh_html.getClickMode();
    if (m === "hand") {
      // Hand tool, so store the current position as capture position,
      // set the grabbing cursor, and return that pointer should be
      // captured
      m_hand_captured = true;
      m_hand_last_x = cx;
      m_hand_last_y = cy;
      lilac_mesh_html.grabbingCursor();
      return true;
      
    } else if (m === "move") {
      // Move points tool, so first of all we want to find the nearest
      // point to the click
      nearest = m_mesh.closestPoint(
                  m_view.mapToNormX(cx),
                  m_view.mapToNormY(cy));
      
      // Ignore call and don't capture mouse if there are no points to
      // move; also, clear selected points and redraw
      if (nearest === false) {
        m_psel = [];
        redraw();
        return false;
      }
      
      // Get the canvas coordinates of the nearest point
      p = m_mesh.getPoint(nearest);
      px = m_view.mapFromNormX(p[0]);
      py = m_view.mapFromNormY(p[1]);
      
      // Ignore call and don't capture mouse if click position is
      // outside the hitbox of the point
      if ((cx < px - OVERLAY_HITBOX_DIM_HALF) ||
          (cx > px + OVERLAY_HITBOX_DIM_HALF) ||
          (cy < py - OVERLAY_HITBOX_DIM_HALF) ||
          (cy > py + OVERLAY_HITBOX_DIM_HALF)) {
        m_psel = [];
        redraw();
        return false;
      }
      
      // If we got here, then user selected a point to move, so change
      // selected points array to be just that point, hide the cursor,
      // redraw, and capture pointer
      m_psel = [nearest];
      redraw();
      lilac_mesh_html.hideCursor();
      return true;
      
    } else if (m === "independent") {
      // Independent triangle tool, so click operation depends on how
      // many points are buffered
      if (m_npts.length < 1) {
        // No points buffered, so first of all clear any selected points
        m_psel = [];
        
        // Add the click location to the new points buffer
        m_npts.push([
          m_view.mapToNormX(cx),
          m_view.mapToNormY(cy)
        ]);
        
        // Hide the cursor, redraw, and capture mouse
        lilac_mesh_html.hideCursor();
        redraw();
        return true;
        
      } else if (m_npts.length === 1) {
        // One point buffered, so add the click location as another
        // point to the new points buffer
        m_npts.push([
          m_view.mapToNormX(cx),
          m_view.mapToNormY(cy)
        ]);
        
        // Hide the cursor, redraw, and capture mouse
        lilac_mesh_html.hideCursor();
        redraw();
        return true;
        
      } else if (m_npts.length === 2) {
        // Two points buffered, so we need to make a triangle with the
        // new point, if we can
        r = m_mesh.addIndependent([
          m_npts[0], m_npts[1], [
            m_view.mapToNormX(cx),
            m_view.mapToNormY(cy)
          ]
        ]);
        
        // Different handling depending on whether we successfully added
        // a triangle
        if (r === false) {
          // We failed to add a triangle, so drop the new points,
          // restore cursor, redraw, and don't capture mouse
          m_npts = [];
          lilac_mesh_html.updateCursor();
          redraw();
          return false;
          
        } else {
          // We successfully added a new triangle, so select the newly
          // added points, flush the new points buffer, hide the cursor,
          // redraw, and capture mouse
          m_psel = r;
          m_npts = [];
          lilac_mesh_html.hideCursor();
          redraw();
          return true;
        }
        
      } else {
        // Invalid state
        fault(func_name, 200);
      }
    
    } else if (m === "pivot") {
      // Pivot triangle tool, so click operation depends on how many
      // points are buffered
      if ((m_psel.length < 1) && (m_npts.length < 1)) {
        // No points buffered, so first of all we want to find the
        // nearest point to the click to look for the pivot point
        nearest = m_mesh.closestPoint(
                    m_view.mapToNormX(cx),
                    m_view.mapToNormY(cy));
        
        // Ignore call and don't capture mouse if there are no points
        if (nearest === false) {
          return false;
        }
        
        // Get the canvas coordinates of the nearest point
        p = m_mesh.getPoint(nearest);
        px = m_view.mapFromNormX(p[0]);
        py = m_view.mapFromNormY(p[1]);
        
        // Ignore call and don't capture mouse if click position is
        // outside the hitbox of the point
        if ((cx < px - OVERLAY_HITBOX_DIM_HALF) ||
            (cx > px + OVERLAY_HITBOX_DIM_HALF) ||
            (cy < py - OVERLAY_HITBOX_DIM_HALF) ||
            (cy > py + OVERLAY_HITBOX_DIM_HALF)) {
          return false;
        }
        
        // If we got here, then we found our pivot point, so select it,
        // redraw, but don't capture mouse (because we aren't modifying
        // the position of the existing point)
        m_psel = [nearest];
        redraw();
        return false;
        
      } else if ((m_psel.length === 1) && (m_npts.length < 1)) {
        // Pivot point selected but no new points buffered, so add the
        // click location as a new point to the new points buffer
        m_npts = [
          [
            m_view.mapToNormX(cx),
            m_view.mapToNormY(cy)
          ]
        ];
        
        // Hide the cursor, redraw, and capture mouse, because we allow
        // modifying position of new point
        lilac_mesh_html.hideCursor();
        redraw();
        return true;
        
      } else if ((m_psel.length === 1) && (m_npts.length === 1)) {
        // Pivot point selected and one new point buffered, so we need
        // to make a triangle with the pivot, the new buffered point,
        // and the current click location, if we can
        r = m_mesh.addPivot(
            m_psel[0],
            [
              m_npts[0], [
                m_view.mapToNormX(cx),
                m_view.mapToNormY(cy)
                ]
            ]);
        
        // Different handling depending on whether we successfully added
        // a triangle
        if (r === false) {
          // We failed to add a triangle, so drop the new point, clear
          // the selected pivot point, restore cursor, redraw, and don't
          // capture mouse
          m_npts = [];
          m_psel = [];
          lilac_mesh_html.updateCursor();
          redraw();
          return false;
          
        } else {
          // We successfully added a new triangle, so select the
          // vertices of the new triangle, flush the new points buffer,
          // hide the cursor, redraw, and capture mouse
          m_psel = r;
          m_npts = [];
          lilac_mesh_html.hideCursor();
          redraw();
          return true;
        }
        
      } else {
        // Invalid state
        fault(func_name, 300);
      }
    
    } else if (m === "extend") {
      // Extend triangle tool, so click operation depends on how many
      // points are selected
      if (m_psel.length < 2) {
        // Less than two points selected, so we want to find the nearest
        // point to the click to look for a point to add
        nearest = m_mesh.closestPoint(
                    m_view.mapToNormX(cx),
                    m_view.mapToNormY(cy));
        
        // Ignore call and don't capture mouse if there are no points in
        // the mesh
        if (nearest === false) {
          return false;
        }
        
        // Get the canvas coordinates of the nearest point
        p = m_mesh.getPoint(nearest);
        px = m_view.mapFromNormX(p[0]);
        py = m_view.mapFromNormY(p[1]);
        
        // If click position is outside the hitbox of the point, then
        // ignore call and don't capture mouse
        if ((cx < px - OVERLAY_HITBOX_DIM_HALF) ||
            (cx > px + OVERLAY_HITBOX_DIM_HALF) ||
            (cy < py - OVERLAY_HITBOX_DIM_HALF) ||
            (cy > py + OVERLAY_HITBOX_DIM_HALF)) {
          return false;
        }
        
        // Check whether point is already selected; if it is, then
        // ignore call and don't capture mouse
        if (seek_sel(nearest) !== false) {
          return false;
        }
        
        // If we got here, then we found another point to select that is
        // not already selected, so add it in proper sorted order to the
        // selected points array, redraw, but don't capture mouse
        // (because we aren't modifying the position of any existing
        // points)
        if (m_psel.length < 1) {
          m_psel = [nearest];
        } else if (nearest < m_psel[0]) {
          m_psel.unshift(nearest);
        } else {
          m_psel.push(nearest);
        }
        redraw();
        return false;
        
      } else if (m_psel.length === 2) {
        // Two existing points already selected, so we need to make a
        // triangle with the existing points and the current click
        // location, if we can
        r = m_mesh.addExtend(
            m_psel[0],
            m_psel[1],
            m_view.mapToNormX(cx),
            m_view.mapToNormY(cy));
        
        // Different handling depending on whether we successfully added
        // a triangle
        if (r === false) {
          // We failed to add a triangle, so clear the selected points,
          // restore cursor, redraw, and don't capture mouse
          m_psel = [];
          lilac_mesh_html.updateCursor();
          redraw();
          return false;
          
        } else {
          // We successfully added a new triangle, so select the
          // vertices of the new triangle, hide the cursor, redraw, and
          // capture mouse
          m_psel = r;
          lilac_mesh_html.hideCursor();
          redraw();
          return true;
        }
        
      } else {
        // Invalid state
        fault(func_name, 400);
      }
      
    } else if (m === "fill") {
      // Fill triangle tool, so begin by finding the nearest point to
      // the click to look for a point to add
      nearest = m_mesh.closestPoint(
                  m_view.mapToNormX(cx),
                  m_view.mapToNormY(cy));
      
      // Ignore call and don't capture mouse if there are no points in
      // the mesh
      if (nearest === false) {
        return false;
      }
      
      // Get the canvas coordinates of the nearest point
      p = m_mesh.getPoint(nearest);
      px = m_view.mapFromNormX(p[0]);
      py = m_view.mapFromNormY(p[1]);
      
      // If click position is outside the hitbox of the point, then
      // ignore call and don't capture mouse
      if ((cx < px - OVERLAY_HITBOX_DIM_HALF) ||
          (cx > px + OVERLAY_HITBOX_DIM_HALF) ||
          (cy < py - OVERLAY_HITBOX_DIM_HALF) ||
          (cy > py + OVERLAY_HITBOX_DIM_HALF)) {
        return false;
      }
      
      // Check whether point is already selected; if it is, then ignore
      // call and don't capture mouse
      if (seek_sel(nearest) !== false) {
        return false;
      }
      
      // We got another point to select, so add it to the selected
      // points array and sort the array
      m_psel.push(nearest);
      m_psel.sort();
      
      // Check whether we got three points selected now
      if (m_psel.length === 3) {
        // We have three points, so make a triangle if we can
        m_mesh.addFill(m_psel[0], m_psel[1], m_psel[2]);
        
        // Clear the selected points array, redraw, and don't capture
        // mouse
        m_psel = [];
        redraw();
        return false;
      
      } else if (m_psel.length < 3) {
        // Don't have three points yet, so redraw and don't capture
        // mouse
        redraw();
        return false;
      
      } else {
        // Invalid state
        fault(func_name, 500);
      }
    
    } else if (m === "drop") {
      // Drop triangle tool, so begin by finding the nearest point to
      // the click to look for a point to add
      nearest = m_mesh.closestPoint(
                  m_view.mapToNormX(cx),
                  m_view.mapToNormY(cy));
      
      // Ignore call and don't capture mouse if there are no points in
      // the mesh
      if (nearest === false) {
        return false;
      }
      
      // Get the canvas coordinates of the nearest point
      p = m_mesh.getPoint(nearest);
      px = m_view.mapFromNormX(p[0]);
      py = m_view.mapFromNormY(p[1]);
      
      // If click position is outside the hitbox of the point, then
      // ignore call and don't capture mouse
      if ((cx < px - OVERLAY_HITBOX_DIM_HALF) ||
          (cx > px + OVERLAY_HITBOX_DIM_HALF) ||
          (cy < py - OVERLAY_HITBOX_DIM_HALF) ||
          (cy > py + OVERLAY_HITBOX_DIM_HALF)) {
        return false;
      }
      
      // Check whether point is already selected; if it is, then ignore
      // call and don't capture mouse
      if (seek_sel(nearest) !== false) {
        return false;
      }
      
      // We got another point to select, so add it to the selected
      // points array and sort the array
      m_psel.push(nearest);
      m_psel.sort();
      
      // Check whether we got three points selected now
      if (m_psel.length === 3) {
        // We have three points, so drop triangle if it exists
        m_mesh.dropTriangle(m_psel[0], m_psel[1], m_psel[2]);
        
        // Clear the selected points array, redraw, and don't capture
        // mouse
        m_psel = [];
        redraw();
        return false;
      
      } else if (m_psel.length < 3) {
        // Don't have three points yet, so redraw and don't capture
        // mouse
        redraw();
        return false;
      
      } else {
        // Invalid state
        fault(func_name, 600);
      }
      
    } else if (m === "normal") {
      // Normal adjustment tool, so begin by finding the nearest point
      // to the click to look for a point to select
      nearest = m_mesh.closestPoint(
                  m_view.mapToNormX(cx),
                  m_view.mapToNormY(cy));
      
      // Clear selected points array, redraw, and don't capture mouse if
      // there are no points in the mesh
      if (nearest === false) {
        m_psel = [];
        redraw();
        return false;
      }
      
      // Get the canvas coordinates of the nearest point
      p = m_mesh.getPoint(nearest);
      px = m_view.mapFromNormX(p[0]);
      py = m_view.mapFromNormY(p[1]);
      
      // If click position is outside the hitbox of the point, then
      // clear selected points array, redraw, and don't capture mouse
      if ((cx < px - OVERLAY_HITBOX_DIM_HALF) ||
          (cx > px + OVERLAY_HITBOX_DIM_HALF) ||
          (cy < py - OVERLAY_HITBOX_DIM_HALF) ||
          (cy > py + OVERLAY_HITBOX_DIM_HALF)) {
        m_psel = [];
        redraw();
        return false;
      }
      
      // If we got here, then select the point, redraw, and don't
      // capture mouse
      m_psel = [nearest];
      redraw();
      return false;
      
    } else {
      // Unrecognized mode
      fault(func_name, 900);
    }
  }
  
  /*
   * Event handler for pointer movement events when the pointer remains
   * down and motion is captured.
   * 
   * This should only be called after handlePointerDown() has returned
   * true and before a handlePointerRelease() call is made.  The call
   * will be ignored if the main div is not currently being displayed.
   * 
   * (cx, cy) are the coordinates of the pointer device location ***in
   * the pixel coordinate space of the canvas***.  The coordinates do
   * not actually have to lie within the canvas, but they have to be
   * transformed properly into the pixel coordinate space of the canvas.
   * 
   * Parameters:
   * 
   *   cx : number - the X coordinate of the event in the pixel
   *   coordinate space of the canvas
   * 
   *   cy : number - the Y coordinate of the event in the pixel
   *   coordinate space of the canvas
   */
  function handlePointerDrag(cx, cy) {
    
    var func_name = "handlePointerDrag";
    var m;
    var dx, dy;
    
    // Ignore if not being displayed
    if (lilac_mesh_html.currentDiv() !== "main") {
      return;
    }
    
    // Check parameters
    if ((typeof cx !== "number") || (typeof cy !== "number")) {
      fault(func_name, 100);
    }
    
    // Change non-finite values to zero
    if (!isFinite(cx)) {
      cx = 0;
    }
    if (!isFinite(cy)) {
      cy = 0;
    }
    
    // Handle different modes
    m = lilac_mesh_html.getClickMode();
    if (m === "hand") {
      // Hand tool, so make sure that we have a stored base coordinate,
      // otherwise ignore this event
      if (!m_hand_captured) {
        return;
      }
      
      // Compute inverse of change from base coordinates
      dx = m_hand_last_x - cx;
      dy = m_hand_last_y - cy;
      
      // Update base coordinates to current coordinates
      m_hand_last_x = cx;
      m_hand_last_y = cy;
      
      // Translate the view and redraw
      m_view.translate(dx, dy);
      redraw();
      
    } else if (m === "move") {
      // Move points tool, so first of all only proceed if exactly one
      // point is selected, else ignore call
      if (m_psel.length !== 1) {
        return;
      }
      
      // Attempt to update point position, and only redraw if update
      // is successful (it is blocked if it would violate triangle
      // orientation rules)
      if (m_mesh.setPoint(
              m_psel[0],
              m_view.mapToNormX(cx),
              m_view.mapToNormY(cy))) {
        redraw();
      }
      
    } else if (m === "independent") {
      // Independent triangle tool, so drag operation depends on how 
      // many points are buffered
      if (m_psel.length === 3) {
        // Three points selected, implying we've just added a new
        // triangle, so try to update the position of the last added
        // point, and only redraw if update is successful (it is blocked
        // if it would violate triangle orientation rules)
        if (m_mesh.setPoint(
                m_psel[2],
                m_view.mapToNormX(cx),
                m_view.mapToNormY(cy))) {
          redraw();
        }
        
      } else if (m_npts.length > 0) {
        // New points buffer is not empty, so update position of most
        // recently added point and redraw
        m_npts[m_npts.length - 1] = [
          m_view.mapToNormX(cx),
          m_view.mapToNormY(cy)
        ];
        redraw();
        
      } else {
        // Shouldn't happen
        fault(func_name, 200);
      }
    
    } else if (m === "pivot") {
      // Pivot triangle tool, so drag operation depends on how many
      // points are buffered
      if (m_psel.length === 3) {
        // Three points selected, implying we've just added a new
        // triangle, so try to update the position of the last added
        // point, and only redraw if update is successful (it is blocked
        // if it would violate triangle orientation rules)
        if (m_mesh.setPoint(
                m_psel[2],
                m_view.mapToNormX(cx),
                m_view.mapToNormY(cy))) {
          redraw();
        }
        
      } else if (m_npts.length > 0) {
        // New points buffer is not empty, so update position of most
        // recently added point and redraw
        m_npts[m_npts.length - 1] = [
          m_view.mapToNormX(cx),
          m_view.mapToNormY(cy)
        ];
        redraw();
        
      } else {
        // Shouldn't happen
        fault(func_name, 300);
      }
      
    } else if (m === "extend") {
      // Pivot triangle tool, so drag operation should only occur when
      // selected points array has three points of a new triangle
      if (m_psel.length === 3) {
        // Three points selected, implying we've just added a new
        // triangle, so try to update the position of the last added
        // point, and only redraw if update is successful (it is blocked
        // if it would violate triangle orientation rules)
        if (m_mesh.setPoint(
                m_psel[2],
                m_view.mapToNormX(cx),
                m_view.mapToNormY(cy))) {
          redraw();
        }
        
      } else {
        // Shouldn't happen
        fault(func_name, 400);
      }
      
    } else if (m === "fill") {
      // Fill mode never captures the mouse, so we shouldn't get here
      fault(func_name, 500);
    
    } else if (m === "drop") {
      // Drop mode never captures the mouse, so we shouldn't get here
      fault(func_name, 600);
    
    } else if (m === "normal") {
      // Normal mode never captures the mouse (on the main canvas), so
      // we shouldn't get here
      fault(func_name, 700);
    
    } else {
      // Unrecognized mode
      fault(func_name, 900);
    }
  }
  
  /*
   * Event handler for pointer release after the pointer has been
   * captured.
   * 
   * This should only be called after handlePointerDown() has returned
   * true.  This call ends the pointer motion by indicating that the
   * pointer has been released.
   */
  function handlePointerRelease() {
    
    var func_name = "handlePointerRelease";
    var m;
    
    // Ignore if not being displayed
    if (lilac_mesh_html.currentDiv() !== "main") {
      return;
    }
    
    // Handle different modes
    m = lilac_mesh_html.getClickMode();
    if (m === "hand") {
      // Hand tool, so clear capture settings and restore cursor
      m_hand_captured = false;
      m_hand_last_x = false;
      m_hand_last_y = false;
      lilac_mesh_html.updateCursor();
      
    } else if (m === "move") {
      // Move point tool, so clear selected points, restore the cursor,
      // and redraw
      m_psel = [];
      lilac_mesh_html.updateCursor();
      redraw();
      
    } else if (m === "independent") {
      // Independent triangle tool, so restore cursor
      lilac_mesh_html.updateCursor();
      
      // Clear selected points array if not already clear and redraw
      m_psel = [];
      redraw();
      
    } else if (m === "pivot") {
      // Pivot triangle tool, so restore cursor
      lilac_mesh_html.updateCursor();
      
      // If selected points array has three points, then clear it and
      // redraw
      if (m_psel.length === 3) {
        m_psel = [];
        redraw();
      }
      
    } else if (m === "extend") {
      // Extend triangle tool, so restore cursor
      lilac_mesh_html.updateCursor();
      
      // Clear selected points array if not already clear and redraw
      m_psel = [];
      redraw();
    
    } else if (m === "fill") {
      // Fill mode never captures the mouse, so we shouldn't get here
      fault(func_name, 500);
    
    } else if (m === "drop") {
      // Drop mode never captures the mouse, so we shouldn't get here
      fault(func_name, 600);
    
    } else if (m === "normal") {
      // Normal mode never captures the mouse (on the main canvas), so
      // we shouldn't get here
      fault(func_name, 700);
      
    } else {
      // Unrecognized mode
      fault(func_name, 900);
    }
  }
  
  /*
   * Handle a zoom-in or zoom-out event request.
   * 
   * go_out is true to zoom out, false to zoom in.
   * 
   * This event is ignored if the main screen is not currently being
   * displayed.  When the main screen is displayed, the m_view object
   * must be defined or a fault occurs when this handler is called.
   * 
   * This function automatically calls redraw() after the view has been
   * changed.
   * 
   * Parameters:
   * 
   *   go_out : boolean - true for zoom out, false for zoom in
   */
  function handleZoom(go_out) {
    
    var func_name = "handleZoom";
    
    // Ignore if not being displayed
    if (lilac_mesh_html.currentDiv() !== "main") {
      return;
    }
    
    // Check that view is defined
    if (m_view === false) {
      fault(func_name, 100);
    }
    
    // Check parameter
    if (typeof go_out !== "boolean") {
      fault(func_name, 200);
    }
    
    // Update the view appropriately
    if (go_out) {
      m_view.zoomOut();
    } else {
      m_view.zoomIn();
    }
    
    // Redraw
    redraw();
  }
  
  /*
   * Redraw the canvas according to the current state.
   * 
   * Calls to this function are ignored unless the main div is currently
   * being displayed.
   * 
   * If the normal tool is active, this also redraws the normal scope
   * canvas.
   */
  function redraw() {
    
    var func_name = "redraw";
    var rc;
    var i;
    var la, le;
    var lvo;
    var tl;
    var pl, p;
    var nl, n, dx, dy;
    var nx, ny;
    
    // Ignore if not being displayed
    if (lilac_mesh_html.currentDiv() !== "main") {
      return;
    }
    
    // Check that local state is active
    if ((m_canvas === false) || (m_nscope === false) ||
        (m_trace === false) || (m_mesh === false) ||
        (m_view === false)) {
      fault(func_name, 100);
    }
    
    // Get layer visibility options
    lvo = lilac_mesh_html.getLayerVisibility();
    
    // Get the rendering context
    rc = m_canvas.getContext("2d");
    if (rc == null) {
      fault(func_name, 200);
    }
    
    // Save rendering state
    rc.save();
    
    // Wrap the rest in a try-finally that always restores rendering
    // state on the way out
    try {
      // Blank canvas to gray and image area to white
      rc.save();
      try {
        rc.fillStyle = "gray";
        rc.globalAlpha = 1.0;
        rc.globalCompositeOperation = "copy";
        rc.fillRect(0, 0, m_canvas.width, m_canvas.height);
      
        rc.fillStyle = "white";
        rc.globalCompositeOperation = "source-over";
        rc.fillRect(m_view.dx, m_view.dy, m_view.dw, m_view.dh);
      } finally {
        rc.restore();
      }
      
      // Draw image under view transform with 50% transparency over the
      // background, if trace image is visibile
      if (lvo.showTrace) {
        rc.save();
        try {
          rc.globalAlpha = 0.5;
          rc.globalCompositeOperation = "source-over";
          rc.drawImage(
            m_trace,
            m_view.sx, m_view.sy, m_view.sw, m_view.sh,
            m_view.dx, m_view.dy, m_view.dw, m_view.dh);
        } finally {
          rc.restore();
        }
      }
      
      // Draw filled triangles under 50% transparency, if filled
      // triangles should be visible
      if (lvo.showFill) {
        // Save state
        rc.save();
        
        try {
          // Set filling state
          rc.globalAlpha = 0.5;
          rc.globalCompositeOperation = "source-over";
          rc.fillStyle = OVERLAY_FILL_COLOR;
        
          // Get a list of triangles
          tl = m_mesh.toTris();
        
          // Render all triangles
          for(i = 0; i < tl.length; i++) {
          
            // Begin a path for the new triangle
            rc.beginPath();
          
            // Move to the first coordinates
            rc.moveTo(
              m_view.mapFromNormX(tl[i][0]),
              m_view.mapFromNormY(tl[i][1]));
          
            // Draw two edges into the path
            rc.lineTo(
              m_view.mapFromNormX(tl[i][2]),
              m_view.mapFromNormY(tl[i][3]));
          
            rc.lineTo(
              m_view.mapFromNormX(tl[i][4]),
              m_view.mapFromNormY(tl[i][5]));
          
            // Close the path to finish the triangle and fill it
            rc.closePath();
            rc.fill();
          }
        
        } finally {
          // Restore state
          rc.restore();
        }
      }
      
      // Get a list of all the lines that need to be rendered and save
      // the state at the start of edge drawing
      rc.save();
      try {
        la = m_mesh.toLines();
        
        // Render all lines in a path
        rc.beginPath();
        for(i = 0; i < la.length; i++) {
          
          // Get current line
          le = la[i];
          
          // Add line to path after transforming to view
          rc.moveTo(
              m_view.mapFromNormX(le[0]),
              m_view.mapFromNormY(le[1]));
          
          rc.lineTo(
              m_view.mapFromNormX(le[2]),
              m_view.mapFromNormY(le[3]));
        }
        
        // Stroke all the triangle lines in the overlay
        rc.globalAlpha = 1.0;
        rc.globalCompositeOperation = "source-over";
        rc.strokeStyle = OVERLAY_LINE_COLOR;
        rc.lineWidth = OVERLAY_LINE_WIDTH;
        rc.lineCap = "round";
        rc.stroke();
      } finally {
        rc.restore();
      }
      
      // Draw all vertex points, but filter out any on the selected
      // points list
      rc.save();
      try {
        rc.globalAlpha = 1.0;
        rc.globalCompositeOperation = "source-over";
        rc.fillStyle = OVERLAY_UNSEL_COLOR;
        
        pl = m_mesh.filterVertex(isUidUnsel);
        for(i = 0; i < pl.length; i++) {
          
          rc.fillRect(
                m_view.mapFromNormX(pl[i][0]) - (OVERLAY_PT_WIDTH / 2),
                m_view.mapFromNormY(pl[i][1]) - (OVERLAY_PT_WIDTH / 2),
                OVERLAY_PT_WIDTH,
                OVERLAY_PT_WIDTH);
          
        }
      } finally {
        rc.restore();
      }
      
      // Draw the selected points
      if (m_psel.length > 0) {
        // Save state and set fill style
        rc.save();
        try {
          rc.globalAlpha = 1.0;
          rc.globalCompositeOperation = "source-over";
          rc.fillStyle = OVERLAY_SEL_COLOR;
          
          // Draw each selected point
          for(i = 0; i < m_psel.length; i++) {
            p = m_mesh.getPoint(m_psel[i]);
            
            rc.fillRect(
                m_view.mapFromNormX(p[0]) - (OVERLAY_PT_WIDTH / 2),
                m_view.mapFromNormY(p[1]) - (OVERLAY_PT_WIDTH / 2),
                OVERLAY_PT_WIDTH,
                OVERLAY_PT_WIDTH);
          }
        
        } finally {
          // Restore state
        rc.restore();
        }
      }
      
      // Draw the new points
      if (m_npts.length > 0) {
        // Save state and set fill style
        rc.save();
        try {
          rc.globalAlpha = 1.0;
          rc.globalCompositeOperation = "source-over";
          rc.fillStyle = OVERLAY_SEL_COLOR;
          
          // Draw each new point
          for(i = 0; i < m_npts.length; i++) {
            p = m_npts[i];
            
            rc.fillRect(
                m_view.mapFromNormX(p[0]) - (OVERLAY_PT_WIDTH / 2),
                m_view.mapFromNormY(p[1]) - (OVERLAY_PT_WIDTH / 2),
                OVERLAY_PT_WIDTH,
                OVERLAY_PT_WIDTH);
          }
        
        } finally {
          // Restore state
          rc.restore();
        }
      }
      
      // Draw normals, if requested
      if (lvo.showNormals) {
        // Save state and set stroke style
        rc.save();
        
        try {
          rc.globalAlpha = 1.0;
          rc.globalCompositeOperation = "source-over";
          rc.strokeStyle = OVERLAY_NORMAL_COLOR;
          rc.lineWidth = OVERLAY_NORMAL_WIDTH;
          rc.lineCap = "round";
          
          // Add each normal to the path
          rc.beginPath();
          nl = m_mesh.toNormals();
          for(i = 0; i < nl.length; i++) {
            
            // Get current normal
            n = nl[i];
            
            // Move to the origin of the normal
            rc.moveTo(
                m_view.mapFromNormX(n[0]),
                m_view.mapFromNormY(n[1]));
            
            // Begin with displacement around unit circle, but invert
            // sign of dy to convert origin to top-left
            dx = n[2];
            dy = -(n[3]);
            
            // Multiply unit displacement by normal length
            dx = dx * OVERLAY_NORMAL_LENGTH;
            dy = dy * OVERLAY_NORMAL_LENGTH;
            
            // Line to the outskirt of normal
            rc.lineTo(
              m_view.mapFromNormX(n[0]) + dx,
              m_view.mapFromNormY(n[1]) + dy);
          }
          
          // Stroke all the normals and restore state
          rc.stroke();
        } finally {
          rc.restore();
        }
      }
      
    } finally {
      rc.restore();
    }
    
    // If the normal tool is active, we need to redraw the normal scope
    // canvas, too
    if (lilac_mesh_html.getClickMode() === "normal") {
      // Get the rendering context for the normal scope
      rc = m_nscope.getContext("2d");
      if (rc == null) {
        fault(func_name, 1000);
      }
      
      // Save rendering state
      rc.save();
      
      // Wrap the rest in a try-finally that always restores rendering
      // state on the way out
      try {
        
        // Blank normal scope to white
        rc.save();
        try {
          rc.fillStyle = "white";
          rc.globalAlpha = 1.0;
          rc.globalCompositeOperation = "copy";
          rc.fillRect(0, 0, m_nscope.width, m_nscope.height);
        } finally {
          rc.restore();
        }
        
        // Draw the X and Y axis lines
        rc.save();
        try {
          rc.globalAlpha = 1.0;
          rc.globalCompositeOperation = "source-over";
          rc.strokeStyle = "black";
          rc.lineWidth = NSC_LINE_WIDTH;
          
          rc.beginPath();
          
          rc.moveTo(0, m_nscope.height / 2);
          rc.lineTo(m_nscope.width, m_nscope.height / 2);
          
          rc.moveTo(m_nscope.width / 2, 0);
          rc.lineTo(m_nscope.width / 2, m_nscope.height);
          
          rc.stroke();
        } finally {
          rc.restore();
        }
        
        // Draw the scope circle
        rc.save();
        try {
          rc.globalAlpha = 1.0;
          rc.globalCompositeOperation = "source-over";
          rc.strokeStyle = "black";
          rc.lineWidth = NSC_CIRCLE_WIDTH;
          
          rc.beginPath();
          rc.moveTo(
            (m_nscope.width / 2) + NSC_CIRCLE_R,
            m_nscope.height / 2);
          rc.arc(
            m_nscope.width / 2,
            m_nscope.height / 2,
            NSC_CIRCLE_R,
            0,
            2 * Math.PI);
          
          rc.stroke();
        } finally {
          rc.restore();
        }
        
        // If there is exactly one point selected, draw the ray and the
        // normal
        if (m_psel.length === 1) {
          
          // Get the normal
          n = m_mesh.getNorm(m_psel[0]);
          
          // First of all, compute the normal X and Y around a unit
          // circle around origin with Y axis increasing UPWARDS
          nx = n[0] * Math.cos(n[1] * 2 * Math.PI);
          ny = n[0] * Math.sin(n[1] * 2 * Math.PI);
          
          // Invert the Y coordinate so it matches Y axis increasing
          // DOWNWARDS
          ny = -(ny);
          
          // Multiply by radius of the circle in the scope
          nx = nx * NSC_CIRCLE_R;
          ny = ny * NSC_CIRCLE_R;
          
          // Translate to center of scope
          nx = nx + (m_nscope.width / 2);
          ny = ny + (m_nscope.height / 2);
          
          // Draw a ray from the origin of the scope to the normal point
          rc.save();
          try {
            rc.globalAlpha = 1.0;
            rc.globalCompositeOperation = "source-over";
            rc.strokeStyle = NSC_RAY_COLOR;
            rc.lineWidth = NSC_RAY_WIDTH;
            
            rc.beginPath();
            rc.moveTo(m_nscope.width / 2, m_nscope.height / 2);
            rc.lineTo(nx, ny);
            
            rc.stroke();
          } finally {
            rc.restore();
          }
          
          // Draw a point on the normal location
          rc.save();
          try {
            rc.globalAlpha = 1.0;
            rc.globalCompositeOperation = "source-over";
            rc.fillStyle = NSC_PT_COLOR;
            
            rc.fillRect(
                nx - (NSC_PT_WIDTH / 2),
                ny - (NSC_PT_WIDTH / 2),
                NSC_PT_WIDTH,
                NSC_PT_WIDTH);
            
          } finally {
            rc.restore();
          }
        }
      
      } finally {
        rc.restore();
      }
    }
  }
  
  /*
   * Resize the canvas according to the new given dimensions.
   * 
   * This may only be called after a canvas is registered with
   * storeCanvas().  However, the main screen does NOT need to be
   * visible to use this function.
   * 
   * This function will automatically redraw the canvas after resizing,
   * but only if the main screen is being displayed.
   * 
   * The new width and height must both be integers that are at least
   * two.
   * 
   * Parameters:
   * 
   *   new_width : number(int) - the new width for the canvas
   * 
   *   new_height : number(int) - the new height for the canvas
   */
  function resize(new_width, new_height) {
    
    var func_name = "resize";
    
    // Check state
    if (m_canvas === false) {
      fault(func_name, 100);
    }
    
    // Check parameters
    if ((typeof new_width !== "number") ||
        (typeof new_height !== "number")) {
      fault(func_name, 200);
    }
    if ((!isFinite(new_width)) || (!isFinite(new_height))) {
      fault(func_name, 210);
    }
    if ((new_width !== Math.floor(new_width)) ||
        (new_height !== Math.floor(new_height))) {
      fault(func_name, 220);
    }
    if ((new_width < 2) || (new_height < 2)) {
      fault(func_name, 230);
    }
    
    // Resize the canvas
    m_canvas.width = new_width;
    m_canvas.height = new_height;
    
    // If we have a view object, get a new view object with the new
    // canvas dimensions
    if (m_view !== false) {
      // If we have a view object, we should have a trace image, too
      if (m_trace === false) {
        fault(func_name, 300);
      }
      
      // Construct the new view object
      m_view = new CanvasView(
                  m_trace.naturalWidth,
                  m_trace.naturalHeight,
                  m_canvas.width,
                  m_canvas.height);
    }
    
    // If the main screen is being displayed, redraw the canvas
    if (lilac_mesh_html.currentDiv() === "main") {
      redraw();
    }
  }
  
  /*
   * Show the main screen.
   * 
   * Provide the trace <img> element, which must be loaded and have
   * dimensions of at least two in both width and height.
   * 
   * Also, provide a mesh data object that represents the initial state
   * of the mesh.  This can be blank or it can be a loaded mesh data
   * file.  The mesh data object will be used as-is, so modifications to
   * it after returning from this function will update state.
   * 
   * This function does NOT register event handlers.  Caller is
   * responsible for connecting event handlers to the appropriate
   * events.
   * 
   * You must call storeCanvas() before this function or a fault occurs.
   * 
   * Parameters:
   * 
   *   trace_img : HTMLImageElement - the loaded trace image
   * 
   *   mesh_data : LilacMesh - the initial mesh state
   */
  function show(trace_img, mesh_data) {
    
    var func_name = "show";
    
    // Check state
    if (m_canvas === false) {
      fault(func_name, 50);
    }
    
    // Check parameters
    if (typeof trace_img !== "object") {
      fault(func_name, 100);
    }
    if (!(trace_img instanceof HTMLImageElement)) {
      fault(func_name, 200);
    }
    if ((trace_img.naturalWidth < 2) ||
        (trace_img.naturalHeight < 2)) {
      fault(func_name, 250);
    }
    
    if (typeof mesh_data !== "object") {
      fault(func_name, 300);
    }
    if (!(mesh_data instanceof LilacMesh)) {
      fault(func_name, 400);
    }
    
    // Initialize local state
    m_trace = trace_img;
    m_mesh = mesh_data;
    m_view = new CanvasView(
                  m_trace.naturalWidth,
                  m_trace.naturalHeight,
                  m_canvas.width,
                  m_canvas.height);
    m_psel = [];
    
    // Show the main screen and (re)draw canvas
    lilac_mesh_html.showDiv("main");
    redraw();
  }
  
  /*
   * Return a serialization of the current mesh.
   * 
   * If no mesh is currently stored, this returns JSON corresponding to
   * an empty mesh.  This can therefore be called at any time.
   */
  function serialize() {
    
    if (m_mesh === false) {
      return "{\"points\": [], \"tris\": []}";
    } else {
      return m_mesh.toJSON();
    }
  }
  
  /*
   * Check whether the mesh is dirty.
   * 
   * If no mesh is currently stored, false is returned.
   * 
   * Return:
   * 
   *   true if mesh is dirty, false otherwise
   */
  function isDirty() {
    if (m_mesh === false) {
      return false;
    } else {
      return m_mesh.isDirty();
    }
  }
  
  /*
   * Clear the dirty flag on the mesh after a save has been successfully
   * performed.
   * 
   * If no mesh is currently stored, this call is ignored.
   */
  function cleanse() {
    if (m_mesh !== false) {
      m_mesh.clearDirty();
    }
  }
  
  /*
   * Export declarations
   * ===================
   * 
   * All exports are declared within a global "main_screen" object.
   */
  window.main_screen = {
    "storeCanvas": storeCanvas,
    "flushMode": flushMode,
    "handlePointerNormal": handlePointerNormal,
    "handlePointerDown": handlePointerDown,
    "handlePointerDrag": handlePointerDrag,
    "handlePointerRelease": handlePointerRelease,
    "handleZoom": handleZoom,
    "redraw": redraw,
    "resize": resize,
    "show": show,
    "serialize": serialize,
    "isDirty": isDirty,
    "cleanse": cleanse
  };
  
}());
