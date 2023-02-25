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
  
  // @@TODO: the display constants below should be loaded from
  // client-side JSON configuration, maybe
  
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

  /*
   * Local data
   * ==========
   */
  
  /*
   * The canvas element on the main page.
   */
  var m_canvas = false;
  
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
   * Register the canvas element on the main form with this module.
   * 
   * You should call this during start-up.  You must call it before
   * using the other functions.
   * 
   * Parameters:
   * 
   *   cnv : HTMLCanvasElement - the canvas on the main page
   */
  function storeCanvas(cnv) {
    
    var func_name = "storeCanvas";
    
    // Check parameter
    if (typeof cnv !== "object") {
      fault(func_name, 100);
    }
    if (!(cnv instanceof HTMLCanvasElement)) {
      fault(func_name, 200);
    }
    
    // Store the canvas
    m_canvas = cnv;
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
    // @@TODO:
    console.log("handlePointerDown " + cx + " " + cy);
    return true;
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
    // @@TODO:
    console.log("handlePointerDrag " + cx + " " + cy);
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
    // @@TODO:
    console.log("handlePointerRelease");
  }
  
  /*
   * Redraw the canvas according to the current state.
   * 
   * Calls to this function are ignored unless the main div is currently
   * being displayed.
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
    
    // Ignore if not being displayed
    if (lilac_mesh_html.currentDiv() !== "main") {
      return;
    }
    
    // Check that local state is active
    if ((m_canvas === false) || (m_trace === false) ||
        (m_mesh === false) || (m_view === false)) {
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
      rc.fillStyle = "gray";
      rc.globalAlpha = 1.0;
      rc.globalCompositeOperation = "copy";
      rc.fillRect(0, 0, m_canvas.width, m_canvas.height);
      
      rc.fillStyle = "white";
      rc.globalCompositeOperation = "source-over";
      rc.fillRect(m_view.dx, m_view.dy, m_view.dw, m_view.dh);
      rc.restore();
      
      // Draw image under view transform with 50% transparency over the
      // background, if trace image is visibile
      if (lvo.showTrace) {
        rc.save();
        rc.globalAlpha = 0.5;
        rc.globalCompositeOperation = "source-over";
        rc.drawImage(
          m_trace,
          m_view.sx, m_view.sy, m_view.sw, m_view.sh,
          m_view.dx, m_view.dy, m_view.dw, m_view.dh);
        rc.restore();
      }
      
      // Draw filled triangles under 50% transparency, if filled
      // triangles should be visible
      if (lvo.showFill) {
        // Save state
        rc.save();
        
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
        
        // Restore state
        rc.restore();
      }
      
      // Get a list of all the lines that need to be rendered and save
      // the state at the start of edge drawing
      rc.save();
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
      rc.restore();
      
      // Draw all vertex points, but filter out any on the selected
      // points list
      rc.save();
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
      rc.restore();
      
      // Draw the selected points
      if (m_psel.length > 0) {
        // Save state and set fill style
        rc.save();
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
        
        // Restore state
        rc.restore();
      }
      
      // Draw the new points
      if (m_npts.length > 0) {
        // Save state and set fill style
        rc.save();
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
        
        // Restore state
        rc.restore();
      }
      
      // Draw normals, if requested
      if (lvo.showNormals) {
        // Save state and set stroke style
        rc.save();
        
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
          
          // Begin with displacement around unit circle, but invert sign
          // of dy to convert origin to top-left
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
        rc.restore();
      }
      
    } finally {
      rc.restore();
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
   * Export declarations
   * ===================
   * 
   * All exports are declared within a global "main_screen" object.
   */
  window.main_screen = {
    "storeCanvas": storeCanvas,
    "handlePointerDown": handlePointerDown,
    "handlePointerDrag": handlePointerDrag,
    "handlePointerRelease": handlePointerRelease,
    "redraw": redraw,
    "resize": resize,
    "show": show
  };
  
}());
