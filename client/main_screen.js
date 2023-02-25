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
   *   OVERLAY_UNSEL_COLOR: CSS color string for unselected points
   *   OVERLAY_SEL_COLOR: CSS color string for selected points
   *   OVERLAY_PT_WIDTH: the width of a point square
   */
  var OVERLAY_LINE_WIDTH = 2;
  var OVERLAY_LINE_COLOR = "blue";
  var OVERLAY_UNSEL_COLOR = "black";
  var OVERLAY_SEL_COLOR = "red";
  var OVERLAY_PT_WIDTH = 8;

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
   * Redraw the canvas according to the current state.
   * 
   * Calls to this function are ignored unless the main div is currently
   * being displayed.
   */
  function redraw() {
    
    var func_name = "redraw";
    var rc;
    var la;
    var i;
    var le;
    
    // Ignore if not being displayed
    if (lilac_mesh_html.currentDiv() !== "main") {
      return;
    }
    
    // Check that local state is active
    if ((m_canvas === false) || (m_trace === false) ||
        (m_mesh === false) || (m_view === false)) {
      fault(func_name, 100);
    }
    
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
      // Blank canvas to white
      rc.fillStyle = "white";
      rc.globalAlpha = 1.0;
      rc.globalCompositeOperation = "copy";
      rc.fillRect(0, 0, m_canvas.width, m_canvas.height);
      
      // Draw image under view transform with 50% transparency over the
      // background
      rc.globalAlpha = 0.5;
      rc.globalCompositeOperation = "source-over";
      rc.drawImage(
        m_trace,
        m_view.sx, m_view.sy, m_view.sw, m_view.sh,
        m_view.dx, m_view.dy, m_view.dw, m_view.dh);
      
      // Return to 100% opacity
      rc.globalAlpha = 1.0;
      rc.globalCompositeOperation = "source-over";
      
      // Get a list of all the lines that need to be rendered
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
      rc.strokeStyle = OVERLAY_LINE_COLOR;
      rc.lineWidth = OVERLAY_LINE_WIDTH;
      rc.lineCap = "round";
      rc.stroke();
      
      // @@TODO:
      
    } finally {
      rc.restore();
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
    "show": show
  };
  
}());
