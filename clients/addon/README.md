This is the addon add-on.  It contains:

* A program (lib/main.js).
* A few tests.
* Some meager documentation.


Updates to get it to run:

Update the addon-sdk-1.0/python-lib/cuddlefish/app-extension/install.rdf to
include the targetApplication for mobile firefox:

    <em:targetApplication>
      <!-- Fennec -->
      <Description>
        <em:id>{a23983c0-fd0e-11dc-95ff-0800200c9a66}</em:id>
        <em:minVersion>4.0b5</em:minVersion>
        <em:maxVersion>7.0.*</em:maxVersion>
      </Description>
    </em:targetApplication>

In packages/api-utils/lib, line 50, comment out this check:

    if (!require("xul-app").isOneOf(["Firefox", "Thunderbird"])) {
      throw new Error([
        "The hidden-frame module currently supports only Firefox and Thunderbird. ",
        "In the future, we would like it to support other applications, however. ",
        "Please see https://bugzilla.mozilla.org/show_bug.cgi?id=546740 for more ",
        "information."
      ].join(""));
    }

This will allow the extension to work on mobile Firefox.