const asset = (file) => new URL(`./assets/${file}`, import.meta.url).href;

export const LOGO_SRC = asset("AFBLogo.PNG");
export const BUTTON_CLICK_SRC = asset("buttonclick1.wav");
export const DEFAULT_CHARACTER_SRC = asset("Basicbunny.png");

export const CHARACTER_CHOICES = [
  { label: "Basic", src: asset("Basicbunny.png") },
  { label: "Blue", src: asset("Bluebunny.png") },
  { label: "Brown", src: asset("Brownbunny.png") },
  { label: "Calico", src: asset("Calicobunny.png") },
  { label: "Frog", src: asset("Frogbunny.png") },
  { label: "Dapper", src: asset("Dapperbunny.png") },
  { label: "Rainbow", src: asset("RainbowBunny.png") },
  { label: "Yellow", src: asset("Yellowbunny.png") },
  { label: "Green", src: asset("Greenbunny.png") },
  { label: "Orange", src: asset("Orangebunny.png") },
  { label: "Purple", src: asset("Purplebunny.png") },
  { label: "Pink", src: asset("Pinkbunny.png") },
  { label: "Bat", src: asset("Batbunny.png") },
  { label: "Cowboy", src: asset("Cowboybunny.png") },
  { label: "Winter", src: asset("Winterbunny.png") },
  { label: "Cheeta", src: asset("cheeta.png") },
  { label: "Ginger", src: asset("ginger.png") },
  { label: "Pikachu", src: asset("pikachu.png") },
  { label: "Kitty", src: asset("kitty.png") }
];

export const COSTUME_CHOICES = [
  { label: "None", src: null },
  { label: "Car", src: asset("car.png") },
  { label: "Sunglasses", src: asset("sunglasses.png") },
  { label: "Bow", src: asset("bow.png") },
  { label: "Headset", src: asset("headset.png") },
  { label: "Crown", src: asset(" crown.png") },
  { label: "Tie", src: asset("tie.png") },
  { label: "Chain", src: asset("chain.png") },
  { label: "Dress", src: asset("dress.png") },
  { label: "Shirt", src: asset("shirt.png") },
  { label: "Tutu", src: asset("tutu.png") },
  { label: "Basket", src: asset("basket.png") }
];

export const LAYER3_CHOICES = {
  hearts: asset("hearts.png"),
  carrot: asset("carrot.png"),
  laugh: asset("laugh.png"),
  flowers: asset("flowers.png"),
  sweat: asset("sweat.png"),
  shine: asset("shine.png"),
  soccer: asset("soccer.png"),
  basketball: asset("Basketball.png"),
  pencil: asset("pencil.png"),
  art: asset("art.png"),
  watermelon: asset("watermelon.png"),
  sparkle: asset("sparkle.png"),
  birthday: asset("birthday.png"),
  confused: asset("confused.png"),
  exclaim: asset("exclaim.png"),
  tulip: asset("tulip.png"),
  purpstar: asset("purpstar.png"),
  moon: asset("moon.png"),
  beer: asset("beer.png"),
  ramen: asset("ramen.png"),
  soda: asset("soda.png")
};

export const WAKE_PHRASE = "come in agent fluffy bunny";
export const END_PHRASE = "over and out";
export const STOP_PHRASE = "stop";
export const BUNNY_PREFIX = "AFB: ";
export const CHAT_URL = "http://localhost:3000/chat";

export const INITIAL_MESSAGES = [
  {
    id: "intro",
    who: "bunny",
    text: 'AFB: Say "Come in Agent Fluffy Bunny" to start hands-free mode 🐰'
  }
];
