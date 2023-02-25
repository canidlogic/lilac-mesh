"use strict";

/*
 * open_screen.js
 * ==============
 * 
 * Module for handling the open files screen of the Lilac Mesh Editor.
 */

// Wrap everything in an anonymous function that we immediately invoke
// after it is declared -- this prevents anything from being implicitly
// added to global scope
(function() {
  
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
                  " in open_screen");
    
    // Throw exception
    throw ("open_screen:" + func_name + ":" + String(loc));
  }
  
  /*
   * Public functions
   * ================
   */
  
  /*
   * Event handler function to call when the "open" button is clicked on
   * the open files form.
   * 
   * This call is ignored if the currently displayed screen is not
   * "open".
   */
  function handleOpen() {
    
    var r;
    
    // Ignore if not currently on open screen
    if (lilac_mesh_html.currentDiv() !== "open") {
      return;
    }
    
    // Get the files that have been selected
    r = lilac_mesh_html.getFiles();
    
    // If no trace image has been selected, show an error and do nothing
    // further
    if (r.trace === false) {
      lilac_mesh_html.openError("warn");
      return;
    }
    
    // Call through to the loading module with the given file(s)
    load_screen.load(r.trace, r.mesh);
  }
  
  /*
   * Show the open screen, optionally with a requested error message.
   * 
   * The requested error message may be one of the following values:
   * 
   *   false -- no error need be displayed
   *   "trace" -- there was an error loading the tracing image
   *   "mesh" -- there was an error loading the mesh file
   * 
   * This function does NOT register event handlers.  Caller is
   * responsible for connecting handleOpen() to the appropriate event.
   * 
   * Parameters:
   * 
   *   er : string | false - the error message to show, or false
   */
  function show(er) {
    
    var func_name = "show";
    
    // Check parameter type
    if (er !== false) {
      if (typeof er !== "string") {
        fault(func_name, 100);
      }
    }
    
    // Update display with appropriate error
    if (er === false) {
      lilac_mesh_html.openError("none");
      
    } else if (er === "trace") {
      lilac_mesh_html.openError("trace");
      
    } else if (er === "mesh") {
      lilac_mesh_html.openError("mesh");
      
    } else {
      // Unrecognized or disallowed error
      fault(func_name, 200);
    }
    
    // Show the open screen
    lilac_mesh_html.showDiv("open");
  }
  
  /*
   * Export declarations
   * ===================
   * 
   * All exports are declared within a global "open_screen" object.
   */
  window.open_screen = {
    "handleOpen": handleOpen,
    "show": show
  };
  
}());
