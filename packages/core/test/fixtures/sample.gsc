#include maps\mp\_utility;
// #include maps\mp\commented;

/*
///ScriptDocBegin
"Name: giveWeapons( <player>, <weapon> )"
"Summary: Gives weapons to a player."
"MandatoryArg: <player>: The player to give to."
"OptionalArg: <weapon>: Weapon name."
///ScriptDocEnd
*/
give_weapons(p, w)
{
	if (!isDefined(w))
		w = "ak47_mp"; // default {
	p giveWeapon(w);
	maps\mp\_utility::wait_for(p, "spawned");
	func = ::give_weapons;
}

init()
{
	level.color = (0/255, 128/255, 255/255);
	iPrintLn("init { not a block");
}
