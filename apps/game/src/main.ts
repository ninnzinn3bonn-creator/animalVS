import "./styles.css";
import { GameMusic } from "./audio/GameMusic";
import { CharacterRepository } from "./character/CharacterRepository";
import { serviceEndpoints } from "./config/services";
import { GameController } from "./game/GameController";
import { PhysicsWorld } from "./game/PhysicsWorld";
import { CharacterSocket } from "./network/CharacterSocket";
import { AppUi } from "./ui/App";
import { VersusMode } from "./versus/VersusMode";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing #app");
}

const canvas = document.createElement("canvas");
const width = 390;
const height = 680;
canvas.width = width;
canvas.height = height;

const music = new GameMusic();
const ui = new AppUi(music);
ui.mount(root, canvas);

const repository = new CharacterRepository();
await repository.load();
ui.setCaptureAvailability(repository.isRemoteAvailable());

const world = new PhysicsWorld(canvas, width, height);
const controller = new GameController(world, repository, ui);
ui.setController(controller);
controller.start();

const versusRoot = document.getElementById("versus-root");
if (!versusRoot) {
  throw new Error("Missing #versus-root");
}
const versusMode = new VersusMode(repository, music);
versusMode.mount(versusRoot);
ui.setVersusMode(versusMode);

if (repository.isRemoteAvailable()) {
  new CharacterSocket(
    serviceEndpoints.websocketUrl("/ws"),
    async (message) => {
      if (message.type === "character.added") {
        await repository.load();
        controller.refreshCharacters();
        versusMode.refreshCharacters();
        ui.characterCreated();
      }
      if (message.type === "character.updated") {
        await repository.load();
        controller.refreshCharacters();
        versusMode.refreshCharacters();
      }
      if (message.type === "character.deleted") {
        await repository.load();
        controller.refreshCharacters();
        versusMode.refreshCharacters();
      }
      if (message.type === "character.processing") {
        ui.characterProcessing();
      }
      if (message.type === "character.failed") {
        ui.characterCreationFailed();
      }
    },
    (connected) => ui.setCaptureAvailability(connected)
  ).connect();
}
