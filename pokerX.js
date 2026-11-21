// ==UserScript==
// @name            pokerX
// @namespace       https://tampermonkey.net/
// @version         1.0
// @author          flxtch
// @match           https://www.torn.com/page.php?sid=holdem*
// @grant           none
// @run-at          document-end
// ==/UserScript==
class EventAction {
  get id() {
    return this.#id;
  }
  static #b_ids = 0;
  static #allVerbose = true;
  #id = `${EventAction.name}_${EventAction.#b_ids++}`;
  #subscribers = [];
  #verbose = true;
  constructor(id, verbose = true) {
    const idPrefix = id ? id : "no id";
    this.#id = `${idPrefix} ${this.#id}`;
    this.#verbose = verbose;
    this.#subscribers.uniqueOnly = true;
  }
  invoke(value) {
    for (let s of this.#subscribers) {
      value !== undefined ? s(value) : s();
    }
  }
  subscribe(subscriber, msg = undefined) {
    if (EventAction.#allVerbose && this.#verbose)
      console.log(
        `${this.id} subscribing ${subscriber.name ? subscriber.name : "anon"}${msg ? ` | msg: ${msg}` : ""}`,
      );
    this.#subscribers.push(subscriber);
    const dupes = XArray.findDupes(this.#subscribers);
    if (!dupes.length) return;
    for (let dupe of dupes)
      this.#subscribers.splice(this.#subscribers.indexOf(dupe), 1);
  }
  unsubscribe(subscriber) {
    for (let s of this.#subscribers) {
      if (s === subscriber) {
        console.log(`${this.id} unsubscribing ${s.name ? s.name : "anon"}`);
        let index = this.#subscribers.indexOf(s);
        this.#subscribers.splice(index, 1);
        return;
      }
    }
  }
}
class ValueStore {
  static get #newInstantiationId() {
    return ValueStore.#b_ids++;
  }
  get id() {
    return this.#id;
  }
  get value() {
    return this.#value;
  }
  set value(v) {
    if (this.supressDuplicateEvents && this.#value === v) return;
    const oldValue = this.#value;
    this.#value = v;
    this.#channel_onChange.invoke([oldValue, this.valueOf()]);
  }
  get subscribe_onChange() {
    return (s) => this.#channel_onChange.subscribe(s);
  }
  get unsubscribe_onChange() {
    return (s) => this.#channel_onChange.unsubscribe(s);
  }
  static #b_ids = 0;
  supressDuplicateEvents;
  #id = `${ValueStore.name}${ValueStore.#newInstantiationId}`;
  #channel_onChange;
  #value;
  #initValue;
  #primitive;
  constructor(id, initValue, muteDupes = true) {
    this.#id += `_${id}`;
    this.#primitive = typeof initValue !== "object";
    this.#channel_onChange = new EventAction(id + "_onChange");
    this.supressDuplicateEvents = muteDupes;
    this.#initValue = initValue;
    this.#value = this.#initValue;
  }
  #equals(nv) {
    if (this.#primitive) {
      return this.value === nv;
    }
    return JSON.stringify(this.value) === JSON.stringify(nv);
  }
  valueOf() {
    return this.#value;
  }
  reset() {
    this.value = this.#initValue;
  }
}
class XArray extends Array {
  static get presets() {
    return {
      ascending: (a, b) => (a > b ? 1 : a === b ? 0 : -1),
      descending: (a, b) => (a < b ? 1 : a === b ? 0 : -1),
    };
  }
  get subscribe_onAdditions() {
    return (s) => this.#channel_onAdditions.subscribe(s);
  }
  get subscribe_onRemovals() {
    return (s) => this.#channel_onRemovals.subscribe(s);
  }
  get autosortEnabled() {
    return this.#b_autosortEnabled;
  }
  set autosortEnabled(value) {
    if (this.autotrimEnabled && value)
      throw new Error(
        `${this.#id} enabled autotrim while autosort was enabled`,
      );
    this.#b_autosortEnabled = value;
    if (this.#b_autosortEnabled) this.#sort();
  }
  set autosorter(delegateSorter) {
    this.#d_sorter = delegateSorter;
  }
  get autotrimEnabled() {
    return this.#b_autotrimEnabled;
  }
  set autotrimEnabled(value) {
    if (this.autosortEnabled && value)
      throw new Error(
        `${this.#id} enabled autotrim while autosort was enabled`,
      );
    this.#b_autotrimEnabled = value;
    if (this.autotrimEnabled && this.#trimRequired) this.#trim();
  }
  get autoTrimLength() {
    return this.#b_autoTrimLength;
  }
  set autoTrimLength(newLength) {
    if (newLength < 0) throw new Error(`${this.#id} set trim length below 0`);
    this.#b_autoTrimLength = newLength;
  }
  get uniqueOnly() {
    return this.#b_uniqueOnly;
  }
  set uniqueOnly(nv) {
    this.#b_uniqueOnly = nv;
    if (this.uniqueOnly) this.#filterUnique();
  }
  get #trimRequired() {
    return this.#b_autotrimEnabled && this.length > this.#b_autoTrimLength;
  }
  static #b_ids = 0;
  #id = `${XArray.name}${XArray.#b_ids++}`;
  #channel_onAdditions = new EventAction(this.#id + "_onAdditions");
  #channel_onRemovals = new EventAction(this.#id + "_onRemovals");
  #b_autosortEnabled = false;
  #b_autotrimEnabled = false;
  #b_uniqueOnly = false;
  #d_sorter;
  #b_autoTrimLength = 0;

  constructor(...data) {
    super(...data);
  }
  static findDupes(arr) {
    return arr.filter((d, i) => arr.indexOf(d) < i); // indexOf returns first occurence
  }
  push(...data) {
    for (let d of data) {
      if (this.uniqueOnly && this.includes(d)) continue;
      super.push(d);
      this.#channel_onAdditions.invoke(d);
    }
    if (this.#trimRequired) this.dequeue();
    if (this.autosortEnabled) this.#sort();
  }
  splice(start, deleteCount) {
    const removalArray = super.splice(start, deleteCount);
    for (let r of removalArray) this.#channel_onRemovals.invoke(r);
    return removalArray;
  }
  dequeue() {
    return this.splice(0, 1)[0];
  }
  remove(...data) {
    for (let d of data) {
      if (!this.includes(d)) continue;
      this.splice(this.indexOf(d), 1);
    }
  }
  clear() {
    this.#channel_onRemovals.invoke(this.splice(0, this.length));
  }
  #sort() {
    if (!this.#d_sorter)
      throw new Error(
        `${XArray.name} autosort was enabled without an assigned delegate`,
      );
    super.sort(this.#d_sorter);
  }
  #trim() {
    while (this.length > this.autoTrimLength) this.dequeue();
  }
  #filterUnique() {
    if (!this.uniqueOnly) return;
    this.remove(...XArray.findDupes(this));
  }
  static DEMO() {
    console.log("___ start", XArray.name, XArray.DEMO.name, "___");
    const xa = new XArray();
    xa.subscribe_onAdditions((arr) => console.log("additions: ", ...arr));
    xa.subscribe_onRemovals((arr) => console.log("removals: ", ...arr));
    xa.autosorter = XArray.presets.ascending;
    xa.autosortEnabled = true;
    for (let i = 0; i < 10; i++) xa.push(i);
    console.log(...xa);
    xa.autosortEnabled = false;
    xa.autoTrimLength = 5;
    xa.autotrimEnabled = true;
    console.log("reiterating with trim enabled");
    for (let i = 0; i < 10; i++) xa.push(i);
    console.log("clearing remaining");
    xa.clear();
    console.log("___ end", XArray.name, XArray.DEMO.name, "___");
  }
}
class Table {
  get baseStake() {
    return this.#parser.getTableStakes();
  }
  get pot() {
    return this.#pot.value;
  }
  get activeSeat() {
    return this.#activeSeat.value;
  }
  get phase() {
    return this.#phase.value;
  }
  get phaseName() {
    return this.#phaseName;
  }
  #newGameChannel = new EventAction("newgame");
  #clientTurnChannel = new EventAction("clientturn");
  #openSeatChannel = new EventAction("openseat");
  #pot = new ValueStore("tablepot", 0);
  #activeSeat = new ValueStore("activeseat", -1, false);
  #phase = new ValueStore("phase", -1);
  #parser;
  #phaseName;
  constructor(parser) {
    this.#parser = parser;
    this.#parser.interface({
      newGame: () => this.#dlgt_newGame(),
      setPot: (nv) => this.#dlgt_setPot(nv),
      setActiveSeat: (nv) => this.#dlgt_setActiveSeat(nv),
      setPhase: (nv) => this.#dlgt_setPhase(nv),
      openSeat: () => this.#dlgt_openSeat(),
    });
    this.#activeSeat.subscribe_onChange((nv) =>
      this.#onActiveSeatChange(nv[1]),
    );
    this.#phase.subscribe_onChange((nv) => this.#onPhaseChange(nv[1]));
  }

  sub_onNewGame(s) {
    this.#newGameChannel.subscribe(s);
  }
  sub_onClientTurn(s) {
    this.#clientTurnChannel.subscribe(s);
  }
  sub_onOpenSeat(s) {
    this.#openSeatChannel.subscribe(s);
  }
  sub_onPotChange(s) {
    this.#pot.subscribe_onChange(s);
  }
  sub_onActiveSeatChange(s) {
    this.#activeSeat.subscribe_onChange(s);
  }
  sub_onPhaseChange(s) {
    this.#phase.subscribe_onChange(s);
  }
  unsub_onNewGame(s) {
    this.#newGameChannel.unsubscribe(s);
  }
  unsub_onClientTurn(s) {
    this.#clientTurnChannel.unsubscribe(s);
  }
  unsub_onOpenSeat(s) {
    this.#openSeatChannel.unsubscribe(s);
  }
  unsub_onPotChange(s) {
    this.#pot.unsubscribe_onChange(s);
  }
  unsub_onActiveSeatChange(s) {
    this.#activeSeat.unsubscribe_onChange(s);
  }
  unsub_onPhaseChange(s) {
    this.#phase.unsubscribe_onChange(s);
  }

  #dlgt_newGame() {
    this.#newGameChannel.invoke();
  }
  #dlgt_setPot(newPot) {
    this.#pot.value = newPot ? newPot : 0; // prevent undefined
  }
  #dlgt_setActiveSeat(seatNum) {
    this.#activeSeat.value = seatNum;
  }
  #dlgt_setPhase(phase) {
    this.#phase.value = phase;
  }
  #dlgt_openSeat() {
    this.#openSeatChannel.invoke();
  }
  #onActiveSeatChange(n) {
    if (n === 0 && Controls.clientPresent) this.#clientTurnChannel.invoke();
  }
  #onPhaseChange(n) {
    switch (n) {
      case 0:
        this.#newGameChannel.invoke();
        this.#phaseName = "preflop";
        return;
      case 1:
        this.#phaseName = "flop";
        return;
      case 2:
        this.#phaseName = "turn";
        return;
      case 3:
        this.#phaseName = "river";
        return;
      default: //-1
        this.#phaseName = "end";
    }
  }
}
class Parser {
  #cfg;
  #potWrap;
  constructor(logElement) {
    new MutationObserver((ml, _) => {
      if (ml[0].addedNodes.length) this.#onLogUpdate(ml[0].addedNodes);
    }).observe(logElement, {
      childList: true,
    });
    this.#potWrap = document.querySelector('[class*="potsWrapper"]');
    new MutationObserver(() => this.#parsePot()).observe(this.#potWrap, {
      subtree: true,
      characterData: true,
      childList: true,
    });
  }
  interface(cfg = {}) {
    if (this.#cfg) throw new Error("parser received second cfg");
    if (!cfg || !Object.keys(cfg).length)
      throw new Error("parser received empty cfg");

    this.#cfg = cfg;
  }
  getTableName() {
    return document
      .querySelector('[class*="table__"]')
      .style.backgroundImage.split(",")[1]
      .match(/\/([^/]+)\.png/)?.[1]
      ?.replace(/^[^_]+_/, "");
  }
  getTableStakes() {
    return tstakes[this.getTableName()];
  }
  #onLogUpdate(updates) {
    for (let update of updates) {
      const classArray = Array.from(update.classList);
      if (classArray.some((c) => c.includes("state"))) {
        this.#parseStateUpdate(update);
      } else {
        this.#parseGeneralUpdate(update);
      }
    }
  }
  #parseStateUpdate(update) {
    if (!this.#cfg.setPhase) return;
    const text = update.innerText.toLowerCase();
    if (text.includes("started")) {
      this.#cfg.setPhase(0);
      const interv = setInterval(() => {
        const active = this.#getActiveSeat();
        if (active === -1) return;
        this.#cfg.setActiveSeat(active);
        clearInterval(interv);
      }, 32);
      return;
    }
    const phases = ["preflop", "the flop", "the turn", "the river"];
    if (phases.some((str) => text.includes(str))) {
      this.#cfg.setPhase(phases.findIndex((p) => text.includes(p)));
      return;
    }
  }
  #parseGeneralUpdate(update) {
    const text = update.innerText.toLowerCase();
    if (text.includes("won") || text.includes("reveals")) {
      if (this.#cfg.setPhase) this.#cfg.setPhase(-1);
      return;
    }
    if (text.includes("table")) {
      if (this.#cfg.openSeat) this.#cfg.openSeat();
      return;
    }
    if (!this.#cfg.setActiveSeat) return;
    setTimeout(() => {
      //? delay to ensure document completed updating
      this.#cfg.setActiveSeat(this.#getActiveSeat());
    }, 30);
  }
  static stripPotString(string) {
    return string.replaceAll(" BB", "").replaceAll("$", "").replaceAll(",", "");
  }
  #parsePot() {
    if (!this.#cfg.setPot) return;
    const potText = this.#potWrap.textContent;
    const isBB = potText.includes("BB");
    const [round, total] = potText.split("POT: ").map((p) => {
      const num = parseFloat(Parser.stripPotString(p));
      return isBB ? num * this.getTableStakes() : num;
    });

    this.#cfg.setPot(total);
  }
  #getActiveSeat() {
    const activeSeatEl = document.querySelector(
      '[class*="opponent"][class*="active"]',
    ); // check for other players' turn
    const num = activeSeatEl
      ? parseInt(activeSeatEl.parentElement.className.split("-")[1][0])
      : document.querySelector('[class*="active"]:not([class*="opponent"])') // check for client turn
        ? 0
        : -1; // no turn

    return num;
  }
}
class Controls {
  static get clientPresent() {
    return this.#getClientPresence();
  }
  static #cc;
  static #controls = {};
  static addControl(t, n, onclk, othersToDisable = []) {
    if (!this.#cc) {
      this.#cc = document.createElement("div");
      const bpan = document.querySelector('[class*="panelTopRow"]');
      if (bpan) bpan.appendChild(this.#cc);
    }
    if (this.#controls[n]) throw new Error(`control ${n} already exists`);

    const container = document.createElement("div");
    const cb = document.createElement("input");
    const label = document.createElement("label");

    container.classList.add("fctrl");
    cb.type = "checkbox";
    cb.name = n;
    const callback = (e) => {
      const value = e.target.checked;
      if (value && othersToDisable.length) {
        for (let d of othersToDisable) {
          if (this.#controls[d] && this.#controls[d].el.checked)
            this.#controls[d].el.click();
        }
      }
      onclk(value);
    };
    cb.onclick = callback;
    label.htmlFor = n;
    label.innerText = t;
    container.append(label, cb);
    this.#cc.appendChild(container);
    this.#controls[n] = {
      el: cb,
      callback,
      r: () => {
        container.remove();
        delete this.#controls[n];
      },
    };
    return this.#controls[n];
  }
  static getNativeButton(index) {
    return document.querySelector('[class*="buttonsWrap__"]').children[index];
  }
  static getRaw(index, downcase = false) {
    const raw = Controls.getNativeButton(index).innerText;
    return downcase ? raw.toLowerCase() : raw;
  }
  static #getClientPresence() {
    return document.querySelector('[class*="betPanelPositioner"]') !== null;
  }
}
(async function () {
  const styling = `
  
:has(>.fctrl) {
    display: flex;
    flex-direction: row;
    justify-content: space-evenly;
    width: 9rem;
    justify-self: end;
    flex-wrap: wrap;
    height: 4.1rem;
    align-content: center;
}
.fctrl {
    font-size: 12px;
    font-weight: 800;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    width: 3.8em;
    height: 2.6em;
}
    .fctrl > input {
    

    height: 2em;
    width: 5em;
}
  [class*="detailsItem"] {
      display: none !important;
      }
    @media screen and (max-width:600px) {
      [class*="panelTopRow"] {
        grid-template-rows: 34px 34px 56px !important;
      }
      [class*="holdemWrapper"] [class*="betOptions"] {
        display: none !important;
      }
    }

#f-buyin {
    --lw: 2rem;
    position: fixed;
    bottom: 1%;
    height: var(--lw);
    width: var(--lw);
}
    `;
  const styler = document.createElement("style");
  const debug = true;
  let logElement;
  let failed = 0;
  styler.innerText = styling;
  document.body.appendChild(styler);
  await thisLong(3000);
  while (!logElement && failed < 20) {
    logElement = document.querySelector('[class*="messagesList"]');
    if (logElement) break;
    failed++;
    await thisLong(200);
  }
  if (failed === 20) throw new Error("failed to get elements");

  window.tapi = new Table(new Parser(logElement));
  window.tstakes = {
    newbie_corner: 10,
    hobo_holdem: 25,
    broke_jokes: 50,
    "8-bit": 100,
    sprinkles: 250,
    "e-asy_street": 500,
    gatling_gun: 1000,
    quickdraw: 2500,
    tight_knit: 5000,
    six_of_the_best: 10000,
    ballsy: 25000,
    boom_or_bust: 50000,
    duel_at_dawn: 100000,
    fourplay: 100000,
    old_n_slow: 100000,
    periodic: 100000,
    pound_it: 250000,
    old_folks_home: 500000,
    comatose_cove: 1000000,
    river_wizard: 1000000,
    tripod: 1000000,
    cats_chance: 2500000,
    juan_on_juan: 5000000,
    slow_cooker: 5000000,
    high_rollers: 10000000,
    fire_pit: 25000000,
    oligarch: 100000000,
  };
  if (debug) {
    const spantest = document.createElement("span");
    spantest.style.position = "fixed";
    spantest.style.top = "0px";
    spantest.style.left = "0px";
    spantest.style.fontSize = "48px";
    document.body.appendChild(spantest);
    tapi.sub_onNewGame(console.log);
    tapi.sub_onActiveSeatChange((nv) =>
      console.log(`seat ${nv[0]} -> seat ${nv[1]}`),
    );
    tapi.sub_onPotChange(console.log);
    tapi.sub_onPhaseChange((nv) => console.log(`phase: ${nv[1]}`));
    tapi.sub_onNewGame(() => console.log("new game starting"));
    tapi.sub_onActiveSeatChange((nv) => (spantest.innerText = nv[1]));
    tapi.sub_onClientTurn(() => console.log("client turn"));
  }
  ctof_init();
  autoBuyIn_init();
  async function thisLong(ms) {
    const P = new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, ms);
    });
    return P;
  }
})();
function autoBuyIn_init() {
  if (Controls.clientPresent) return;
  const cb = document.createElement("input");
  cb.name = "fbuyin";
  cb.type = "checkbox";
  cb.id = "f-buyin";
  cb.addEventListener("click", (e) => {
    e.target.checked ? onEnable() : onDisable();
  });
  document.body.appendChild(cb);
  function onEnable() {
    console.log("enabled auto buy in");
    if (getBuyInButton()) return onOpenSeat();
    tapi.sub_onOpenSeat(onOpenSeat);
  }
  function onDisable() {
    console.log("disabled auto buy in");
    tapi.unsub_onOpenSeat(onOpenSeat);
    setTimeout(() => {
      cb.checked = false;
      if (Controls.clientPresent) cb.remove();
    }, 250);
  }
  function onOpenSeat() {
    setTimeout(() => {
      let confirmationButton = getConfirmationButton();
      let failed = 0;
      getBuyInButton().click();
      const interv = setInterval(() => {
        if (failed > 30) throw new Error("couldn't fetch confirmation button");
        confirmationButton = !confirmationButton
          ? getConfirmationButton()
          : confirmationButton; // don't fetch again on retry
        if (!confirmationButton || confirmationButton.disable) return failed++; //retry
        confirmationButton.click();
        window.location.reload();
        //? technically below not needed because of reload but 
        // //? it still feels wrong to exclude memory-leak-preventing code
        onDisable();
        clearInterval(interv);
      }, 50);
    }, 250);
  }

  function getBuyInButton() {
    return document.querySelector('[class*="sitInButton"');
  }
  function getConfirmationButton() {
    return document.querySelector(
      `[class*="buyInWrap"]>[class*="contentWrapper"]>[class*="buttonsWrap"]>[class*="btn__"]`,
    );
  }
}
function ctof_init() {
  const t = "CToF";
  const n = "ctof";
  const disables = ["ff"];
  const callback = (v) => {
    if (v) {
      enable();
    } else {
      disable();
    }
  };
  const control = Controls.addControl(t, n, callback, disables);
  let pinned = 0;
  function disable() {
    tapi.unsub_onClientTurn(onClientTurn);
    tapi.unsub_onPhaseChange(onPhaseChange);
    control.el.checked = false;
  }
  function enable() {
    const content = Controls.getRaw(1, true);
    if (content.includes("sit") || content.includes("back")) return disable();
    if (content !== "check") {
      pinned = parseRaw(content);
      console.log("pinning " + pinned);
    }
    if (tapi.activeSeat === 0) {
      onClientTurn();
      return;
    }
    tapi.sub_onClientTurn(onClientTurn);
    tapi.sub_onPhaseChange(onPhaseChange);
  }
  function onClientTurn() {
    const content = Controls.getRaw(1, true);
    if (content === "check") {
      const b = Controls.getNativeButton(1);
      if (!b.className.includes("queued")) b.click();
      return;
    }
    const current = parseRaw(Controls.getRaw(1, true));
    console.log(`pinned: ${pinned}\ncurrent: ${current}`);
    if (Math.abs(pinned - current) <= 0.1 * tapi.baseStake) {
      // minimum delta to prevent folding when BB rounding doesn't match dollar actual
      console.log("client calls");
      const b = Controls.getNativeButton(1);
      if (!b.className.includes("queued")) b.click();
    } else {
      console.log("client folds");
      const b = Controls.getNativeButton(2);
      if (!b.className.includes("queued")) b.click();
      disable();
    }
  }
  function onPhaseChange() {
    return disable();
  }
  function parseRaw(raw) {
    const number = parseFloat(Parser.stripPotString(raw.split(" ")[1]));
    const mSearch = raw.split(" ")[1].replaceAll("bb", "");
    const multiple = mSearch.includes("k")
      ? 1000
      : mSearch.includes("m")
        ? 1000000
        : mSearch.includes("b")
          ? 1000000000
          : 1;
    const base = raw.includes("bb") ? tapi.baseStake : 1;
    return number * multiple * base;
  }

  //! known issues
  // edge case sometimes where ctof does not disable on phase change, needs further investigation
  // todo:
  // force fold
  // add call up-to functionality to ctof
  //  uses bet input (stylize when active)
}
