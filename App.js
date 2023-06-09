import React, { Component } from "react";
import update from "immutability-helper";
import autobahn from "autobahn";

import "./App.css";
import GameAPIConnection from "./connection-layer.js";
import { suitToSymbol } from "./helper.js";
import { Bid1Controls, Bid2Controls } from "./movectls.js";
import UIBut from "./uibut.js";

function resolvePlayerPosition(position, player) {
  switch (Number(position)) {
    case (player + 1) % 4:
      return "left";
    case (player + 2) % 4:
      return "top";
    case (player + 3) % 4:
      return "right";
    default:
      return "bottom";
  }
}

class Card extends Component {
  render() {
    return (
      <div className={`card card${this.props.color}`} onClick={() => this.props.onClick()}>
        {this.props.children}
      </div>
    );
  }
}

class fcDownHand extends Component {
  render() {
    const n = this.props.size;
    return (
      <div className={`hand ${this.props.player}hand`}>
        <div className="playername">
          {this.props.playerName}
        </div>
        <div className="cards">
          {[...Array(n)].map((x, i) => <Card key={i} color="black" onClick={() => false} />)}
        </div>
      </div>
    );
  }
}

class fcUpCard extends Component {
  constructor(props) {
    super(props);
    if (this.props.suit === "D" || this.props.suit === "H") {
      this.color = "red";
    } else {
      this.color = "black";
    }

    this.suitSymbol = suitToSymbol(this.props.suit);
  }

  render() {
    return (
      <Card color={this.color} onClick={() => this.props.onClick()}>
        {this.props.rank + this.suitSymbol}
      </Card>
    );
  }

  static fromStr(s, onClick) {
    const [rank, suit] = s.split(".");
    return <fcUpCard suit={suit} rank={rank} key={rank + suit} onClick={onClick} />;
  }
}

class Hand extends Component {
  render() {
    const cardStrs = this.props.cards;
    return (
      <div className="hand myhand">
        <div className="cards">
          {cardStrs.map((cardStr, index) => {
            return fcUpCard.fromStr(cardStr, () => this.props.onClick(index));
          })}
        </div>
        <div className="playername">
          {this.props.playerName}
        </div>
      </div>
    );
  }
}

class Trick extends Component {
  render() {
    const cards = this.props.cards;
    const player = this.props.player;
    return (
      <div className="trick">
        {Object.entries(cards).map(
          ([position, card]) =>
            card &&
            <div key={card} className={`trick${resolvePlayerPosition(position, player)} trickcard`}>
              {fcUpCard.fromStr(card, () => false)}
            </div>
        )}
      </div>
    );
  }
}

function Scoreboard(props) {
  const yourTeam = props.team;
  const otherTeam = 1 - yourTeam;
  return (
    <div className="scoreboard" style={{ textAlign: "left" }}>
      {props.dealing ? <div>You are the dealer</div> : null}
      {props.turn ? <div>It's your turn</div> : null}
      {props.trump !== undefined
        ? <div>
            Trump: {props.trump}
          </div>
        : null}
      {props.tricks
        ? <div>
            Tricks taken: {props.tricks[yourTeam]}–{props.tricks[otherTeam]}{" "}
          </div>
        : null}
      <div>
        Score: {props.scores[yourTeam]}–{props.scores[otherTeam]}
      </div>
    </div>
  );
}

class Table extends Component {
  tableEdgeBoxes(positionsToContents) {
    return Object.entries(positionsToContents).map(([position, contents]) =>
      <div className={`${position}-box`} key={position}>
        {contents}
      </div>
    );
  }

  renderHandDisplays() {
    const player = this.props.position;
    const name = this.props.players[player];
    const handDisplays = {};
    for (let otherPosition of [0, 1, 2, 3].filter(x => x !== player)) {
      const position = resolvePlayerPosition(otherPosition, player);
      const playerName = this.props.players[otherPosition];
      handDisplays[position] = (
        <fcDownHand
          size={this.props.gameState !== null ? this.props.gameState.hands[otherPosition] : 0}
          playerName={playerName}
          player={position}
          key={otherPosition}
        />
      );
    }
    handDisplays["bottom"] = (
      <Hand
        playerName={name}
        cards={this.props.gameState !== null ? this.props.gameState.hand : []}
        onClick={i => this.props.handleCardClick(i)}
      />
    );
    return handDisplays;
  }

  renderCenterBox() {
    const gameState = this.props.gameState;
    if (gameState === null) {
      return null;
    }
    const phase = gameState.phase;
    const player = this.props.position;
    return (
      <div className="center-box">
        {phase &&
          phase.startsWith("bid") &&
          <div className="upcard">
            {fcUpCard.fromStr(gameState.upcard, () => false)}
          </div>}
        {this.renderBidControls()}
        {phase === "play" && <Trick cards={gameState.trick} player={player} />}
      </div>
    );
  }

  myTurn() {
    return this.props.gameState.turn === this.props.player;
  }

  renderBidControls() {
    if (this.myTurn()) {
      switch (this.props.gameState.phase) {
        case "bid1":
          return (
            <Bid1Controls
              className="bid-controls"
              call={alone => this.props.gameAPIConnection.bid1(true, alone)}
              pass={() => this.props.gameAPIConnection.bid1(false, false)}
            />
          );
        case "bid2":
          return (
            <Bid2Controls
              className="bid-controls"
              call={(trump, alone) => this.props.gameAPIConnection.bid2(true, trump, alone)}
              pass={() => this.props.gameAPIConnection.bid2(false, false, null)}
            />
          );
        default:
          return null;
      }
    }
  }

  render() {
    const player = this.props.position;
    const edgeDisplays =
      player !== null
        ? this.renderHandDisplays()
        : ["bottom", "left", "top", "right"].reduce((result, position, i) => {
            result[position] = (
              <UIBut className="join-seat-button" onClick={() => this.props.joinSeat(i)} key={i}>
                Join seat
              </UIBut>
            );
            return result;
          }, {});

    return (
      <div className="grid_8" id="table">
        {this.tableEdgeBoxes(edgeDisplays)}
        {this.renderCenterBox()}
      </div>
    );
  }
}

class Lobby extends Component {
  constructor() {
    super();
    this.state = {
      gameState: null,
      messages: [],
      seats: Array(4).fill(null),
      players: null,
      position: null
    };
  }

  addMessage(message) {
    message.when = Date.now();
    this.setState(prevState => ({
      messages: prevState.messages.concat(message)
    }));
  }

  componentDidMount() {
    const gameAPIConnection = this.props.gameAPIConnection;
    gameAPIConnection.getPlayers().then(players => this.setState({ players }));
    gameAPIConnection.getSeats().then(seats => this.setState({ seats }));
    gameAPIConnection.subscribeToPlayers(([players]) =>
      this.setState(prevState => update(prevState, { players: { $merge: players } }))
    );
    gameAPIConnection.subscribeToChat(([message]) => this.addMessage(message));
    gameAPIConnection.subscribeToSeats(([res]) => {
      Object.entries(res).map(([seat, playerID]) =>
        this.setState(prevState =>
          update(prevState, {
            seats: {
              [seat]: { $set: playerID }
            }
          })
        )
      );
    });
    this.trackGame();
    console.log("subscribed");
  }

  handleCardClick(i) {
    if (!this.myTurn()) {
      return;
    }
    const phase = this.state.gameState.phase;
    if (phase !== "play" && phase !== "discard") {
      return;
    }

    const card = this.state.gameState.hand[i];
    this.props.gameAPIConnection.performMove(phase, card);
  }

  joinSeat(position) {
    this.props.gameAPIConnection.joinSeat(position).then(() =>
      // TODO: could the following be simplified to setState({position})?
      this.setState(prevState =>
        update(prevState, {
          position: {
            $set: position
          }
        })
      )
    );
  }

  myTurn() {
    return this.state.gameState.turn === this.state.position;
  }

  trackGame() {
    this.props.gameAPIConnection.subscribeToPublicState(res => this.setState({ gameState: res }));
    this.props.gameAPIConnection.subscribeToHand(([res]) =>
      this.setState(prevState =>
        update(prevState, {
          gameState: {
            $merge: {
              hand: res
            }
          }
        })
      )
    );
  }

  renderScoreboardSpot() {
    const gameState = this.state.gameState;
    if (gameState !== null) {
      return (
        <Scoreboard
          dealing={gameState.dealer === this.state.position}
          scores={gameState.score}
          team={this.state.position % 2}
          tricks={gameState.trickScore}
          trump={gameState.trump}
          turn={this.myTurn()}
        />
      );
    } else if (this.state.seats.every(x => x !== null)) {
      return (
        <UIBut onClick={() => this.props.gameAPIConnection.startGame()}>Start Game</UIBut>
      );
    }
    return null;
  }

  render() {
    const gameState = this.state.gameState;
    return (
      <div className="container_12 App">
        <Table
          gameAPIConnection={this.props.gameAPIConnection}
          gameState={gameState}
          player={this.state.position}
          players={this.state.seats.map(x => (x !== null ? this.state.players[x] : null))}
          position={this.state.position}
          handleCardClick={i => this.handleCardClick(i)}
          joinSeat={pos => this.joinSeat(pos)}
        />
        <div className="grid_4 sidebar">
          <div className="scoreboard-container">
            {this.renderScoreboardSpot()}
          </div>
        </div>
      </div>
    );
  }
}

class App extends Component {
  constructor() {
    super();
    this.state = {
      gameAPIConnection: null,
      playerID: null
    };
  }

  componentDidMount() {
    const wsuri = `ws://${document.location.hostname}:8080/ws`;

    // the WAMP connection to the Router
    this.connection = new autobahn.Connection({
      url: wsuri,
      realm: "realm1"
    });

    // fired when connection is established and session attached
    this.connection.onopen = (session, details) => {
      session
        .call("join_server", [])
        .then(([playerID]) => {
          this.setState({
            gameAPIConnection: new GameAPIConnection(session, playerID),
            playerID
          });
          console.log("Player ID: " + playerID);
        })
        .catch(console.log);
      console.log("Connected");
    };

    // fired when connection was lost (or could not be established)
    //
    this.connection.onclose = function(reason, details) {
      console.log("Connection lost: " + reason);
    };

    // now actually open the connection
    this.connection.open();
  }

  render() {
    return this.state.gameAPIConnection
      ? <Lobby gameAPIConnection={this.state.gameAPIConnection} playerID={this.state.playerID} />
      : <div>Connecting...</div>;
  }
}

export default App;
