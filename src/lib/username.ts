import {
  uniqueNamesGenerator,
  adjectives,
  animals,
  NumberDictionary,
} from "unique-names-generator";

export function generateUsername(): string {
  const numberDictionary = NumberDictionary.generate({ min: 10, max: 99 });
  return uniqueNamesGenerator({
    dictionaries: [adjectives, animals, numberDictionary],
    separator: "-",
    length: 3,
    style: "lowerCase",
  });
}

export function generateDisplayName(): string {
  return uniqueNamesGenerator({
    dictionaries: [adjectives, animals],
    separator: " ",
    length: 2,
    style: "capital",
  });
}
