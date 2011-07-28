/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at:
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Mozilla Raindrop Code.
 *
 * The Initial Developer of the Original Code is
 *   The Mozilla Foundation
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Andrew Sutherland <asutherland@asutherland.org>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

/**
 * Moda test helper logic that constitutes a meta-representation and behaviour
 *  check of the moda representation.  It may seem silly, but it's much more
 *  comprehensive and reliable a way to do it than having a massive set of
 *  manually created permutations in the unit tests.  (Note, however, that we
 *  do need to make sure to actually create all the permutations that need
 *  to be tested in the unit test.)
 *
 * Our interaction with the moda layer is one of direct consumer which we then
 *  expose into the logging framework.
 *
 * Our knowledge of (expected) state is (intentionally) limited to what we infer
 *  from the actions taken by the testing layer in the test.  Specifically, we
 *  don't query the database to find out the (already) known contacts but rather
 *  rely on the test command to add a contact.  This is a desirable limitation
 *  because it avoids having our tests use broken circular reasoning, but it
 *  does mean that if we have a test that starts from database persisted state
 *  then the testing layer needs to be fed that expected state somehow.
 * A specific example of what we want to avoid is having broken program logic
 *  that nukes the contact database and then have the testing logic assume
 *  the user is supposed to have no contacts.  Obviously if our testing logic
 *  was written in a way that it nukes its expected set of contacts too,
 *  this will not help, but that's why we generate human understandable logs;
 *  so that the author can sanity check what actions the tests actually took
 *  and check the results.
 *
 * In general, we try and leverage the internal structures of the "testClient"
 *  and "thing" representations rather than building our own redundant shadow
 *  data structures.
 *
 * Our interaction with testClient/testServer is handled by registering ourself
 *  with the testClient instances so that when testClient expectation
 *  methods are invoked, it can call us so that we can contribute to test steps
 *  and optionally provide additional test steps.
 * For example, when sending a conversation message, all participanting
 *  testClients will have do_expectConvMessage invoked on them.  We can insert
 *  actions into the replica processing stage about what happens on the client
 *  non-UI logic thread with gated notifications to the UI thread, then
 *  introduce an additional step where we release the notifications to the UI
 *  thread.
 **/

define(function(require, exports, $module) {

var $Q = require('q'),
    when = $Q.when;

var $testdata = require('rdcommon/testdatafab');

var $log = require('rdcommon/log');

var $moda_api = require('rdcommon/moda/api'),
    $moda_worker = require('rdcommon/moda/worker'),
    $ls_tasks = require('rdcommon/rawclient/lstasks');

/**
 * There should be one moda-actor per moda-bridge.  So if we are simulating
 *  a desktop client UI that implements multiple tabs, each with their own
 *  moda bridge, then there should be multiple actor instances.
 */
var TestModaActorMixins = {
  __constructor: function(self, opts) {
    if (!opts.client)
      throw new Error("Moda actors must be associated with a client!");
    self._testClient = opts.client;

    /** Dynamically updated list of contacts (by canon client). */
    self._dynamicContacts = [];
    self._contactMetaInfoByName = {};

    self.T.convenienceSetup(self, 'initialize', function() {
      // - create our self-corresponding logger, it will automatically hookup
      self._logger = LOGFAB.testModa(self, self._testClient._logger,
                                     self.__name);

      self._eBackside = self.T.actor('modaBackside', self.__name, null, self);
      self.RT.reportActiveActorThisStep(self._eBackside);

      self._notif = self._testClient._rawClient.store._notif;

      // - create the moda worker daemon
      //self._eWorker = self.T.actor();
      self._backside = new $moda_worker.ModaBackside(
                             self._testClient._rawClient, self.__name,
                             self._logger);

      // - create the moda bridge
      // (It has no logger and thus we create no actor; all its events get
      //   logged by us on our logger.)
      self._bridge = new $moda_api.ModaBridge();

      // - link worker and bridge (hackily)
      self._bridge._sendObjFunc = self._backside.XXXcreateBridgeChannel(
                                    self.__name,
                                    self._bridge._send.bind(self._bridge));
    });
  },

  //////////////////////////////////////////////////////////////////////////////
  // Shadow Contact Information

  /**
   * Retrieve our test-only contact info meta-structure from the perspective
   *  of the moda bridge.
   */
  _lookupContactInfo: function(contactTestClient) {
    return this._contactMetaInfoByName[contactTestClient.__name];
  },

  _getAllContactInfos: function(sortFunc) {
    var infos = [];
    for (var key in this._contactMetaInfoByName) {
      infos.push(this._contactMetaInfoByName[key]);
    }
    if (sortFunc)
      infos.sort(sortFunc);
    return infos;
  },



  //////////////////////////////////////////////////////////////////////////////
  // Notifications from testClient

  /**
   * Invoked during the action step
   */
  __addingContact: function(other) {
    var nowSeq = this.RT.testDomainSeq;
    this._dynamicClients.push(other);
    this._contactMetaInfoByName[other.__name] = {
      rootKey: testClient._rawClient.rootPublicKey,
      name: other.__name,
      any: nowSeq,
      write: nowSeq,
      recip: nowSeq,
    };
    // XXX generate peep query delta expectations
  },

  __receiveConvWelcome: function(tConv) {
    // nb: tConv's backlog is a dynamic state correlated with the global
    //  conversation state as opposed to a snapshot at the time a welcome was
    //  issued.
    var backlog = tConv.data.backlog;
    for (var iMsg = 0; iMsg < backlog.length; iMsg++) {
      this.__receiveConvMessage(tConv, backlog[iMsg]);
    }
  },

  __receiveConvMessage: function(tConv, tMsg) {
    if (tMsg.type === 'message') {
      var ainfo = this._lookupContactInfo(tMsg.data.author);
      ainfo.write = Math.max(ainfo.write, tMsg.seq);
      ainfo.any = Math.max(ainfo.any, tMsg.seq);

      for (var iPart = 0; iPart < tConv.participants.length; iPart++) {
        var participant = tConv.participants[iPart];
        if (participant === this || participant === tMsg.data.author)
          continue;
        var pinfo = this._lookupContactInfo(participant);
        pinfo.recip = Math.max(pinfo.recip, tMsg.seq);
      }
    }
  },

  //////////////////////////////////////////////////////////////////////////////
  // LiveSet Listener handling
  //
  // We translate the notifications into an ordered state representation that
  //  uses only the root names of things.

  _remapLocalToClientData: function(namespace, localName) {
    return this._notif.mapLocalNameToFullName(this._backside._querySource,
                                              namespace,
                                              localName);
  },

  onItemsModified: function(items, liveSet) {
  },

  onSplice: function(index, howMany, addedItems, liveSet) {
    if (!liveSet.completed)
      return;
    // XXX implement this, very similar to logic in `client-db-views.js`, steal.
    //this._logger.queryUpdateSplice(liveSet.data.__name, deltaRep);
  },

  onCompleted: function(liveSet) {
    var rootKeys;
    for (var i = 0; i < liveSet.items.length; i++) {
      rootKeys.push(this._remapLocalToClientData(liveSet._ns, liveSet.items[i])
                      .fullName);
    }

    this._logger.queryCompleted(liveSet.data.__name, rootKeys);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Queries

  _PEEP_QUERY_BY_TO_CMPFUNC: {
    alphabet: function(a, b) {
      return a.name.localeCompare(b.name);
    },
    any: function(a, b) {
      return a.any - b.any;
    },
    recip: function(a, b) {
      return a.recip - b.recip;
    },
    write: function(a, b) {
      return a.write - b.write;
    },
  },

  /**
   * Instantiate a new live query.  We check the results of the query (once
   *  concluded) to ensure that the results match the expected testing state.
   *  Additionally, all future test-induced state changes we hear about will
   *  have expectations generated for them.  Use `do_killQuery` when you are
   *  done with the query.
   */
  do_queryPeeps: function(thingName, query) {
    var lqt = this.T.thing('livequery', thingName), self = this;

    this.T.action(this, 'create', lqt, function() {
      // -- generate the expectation
      var cinfos = self._getAllContactInfos(
                     self._PEEP_QUERY_BY_TO_CMPFUNC[query.by]);
      var rootKeys = cinfos.map(function(x) {return x.rootKey;});
      self.expect_queryCompleted(lqt.__name, rootKeys);

      lqt._liveset = self._bridge.queryPeeps(query, self, lqt);
    });

    return lqt;
  },

  do_queryPeepConversations: function(modaPeep, query) {
  },

  do_queryConversations: function(query) {
  },

  /**
   * Unsubscribe a live query and forget about it.  We structure our listeners
   *  so that if the live query logic screws up and keeps sending us events
   *  we will throw up errors.
   */
  do_killQuery: function() {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Actions

  /**
   * Create a conversation (using the moda API).  The entire testClient
   *  conversation creation set of steps is run, plus we wait for the
   *  moda representation updates once the conversation creation process
   *  makes it back to us.
   */
  do_createConversation: function(args) {
  },

  //////////////////////////////////////////////////////////////////////////////
  // Notification Queries

  //////////////////////////////////////////////////////////////////////////////
};

var LOGFAB = exports.LOGFAB = $log.register($module, {
  testModa: {
    // we are a client/server client, even if we are smart for one
    type: $log.TEST_SYNTHETIC_ACTOR,
    subtype: $log.CLIENT,
    topBilling: true,

    events: {
      queryCompleted: {name: true},
      queryUpdateSplice: {},
    },
  },
});

exports.TESTHELPER = {
  // we leave it to the testClient TESTHELPER to handle most stuff, leaving us
  //  to just worry about moda.
  LOGFAB_DEPS: [LOGFAB,
    $moda_worker.LOGFAB, $ls_tasks.LOGFAB,
  ],

  actorMixins: {
    testModa: TestModaActorMixins,
  },
};

}); // end define