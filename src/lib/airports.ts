export type Airport = {
  city: string;
  name: string;
  code: string;
  country: string;
  aliases?: string[];
};

export const AIRPORTS: Airport[] = [
  { city: "Agartala", name: "Maharaja Bir Bikram Airport", code: "IXA", country: "India" },
  { city: "Agra", name: "Agra Airport", code: "AGR", country: "India" },
  {
    city: "Ahmedabad",
    name: "Sardar Vallabhbhai Patel International Airport",
    code: "AMD",
    country: "India",
  },
  {
    city: "Amritsar",
    name: "Sri Guru Ram Dass Jee International Airport",
    code: "ATQ",
    country: "India",
  },
  { city: "Aurangabad", name: "Aurangabad Airport", code: "IXU", country: "India" },
  { city: "Bagdogra", name: "Bagdogra International Airport", code: "IXB", country: "India" },
  {
    city: "Bengaluru",
    name: "Kempegowda International Airport",
    code: "BLR",
    country: "India",
    aliases: ["Bangalore"],
  },
  { city: "Bhopal", name: "Raja Bhoj Airport", code: "BHO", country: "India" },
  {
    city: "Bhubaneswar",
    name: "Biju Patnaik International Airport",
    code: "BBI",
    country: "India",
  },
  {
    city: "Chandigarh",
    name: "Shaheed Bhagat Singh International Airport",
    code: "IXC",
    country: "India",
  },
  {
    city: "Chennai",
    name: "Chennai International Airport",
    code: "MAA",
    country: "India",
    aliases: ["Madras"],
  },
  { city: "Coimbatore", name: "Coimbatore International Airport", code: "CJB", country: "India" },
  { city: "Dehradun", name: "Jolly Grant Airport", code: "DED", country: "India" },
  {
    city: "Delhi",
    name: "Indira Gandhi International Airport",
    code: "DEL",
    country: "India",
    aliases: ["New Delhi"],
  },
  { city: "Dibrugarh", name: "Dibrugarh Airport", code: "DIB", country: "India" },
  { city: "Dimapur", name: "Dimapur Airport", code: "DMU", country: "India" },
  { city: "Goa", name: "Manohar International Airport", code: "GOX", country: "India" },
  { city: "Goa", name: "Goa International Airport", code: "GOI", country: "India" },
  {
    city: "Guwahati",
    name: "Lokpriya Gopinath Bordoloi International Airport",
    code: "GAU",
    country: "India",
  },
  { city: "Gwalior", name: "Rajmata Vijaya Raje Scindia Airport", code: "GWL", country: "India" },
  { city: "Hyderabad", name: "Rajiv Gandhi International Airport", code: "HYD", country: "India" },
  { city: "Imphal", name: "Bir Tikendrajit International Airport", code: "IMF", country: "India" },
  { city: "Indore", name: "Devi Ahilya Bai Holkar Airport", code: "IDR", country: "India" },
  { city: "Jaipur", name: "Jaipur International Airport", code: "JAI", country: "India" },
  { city: "Jammu", name: "Jammu Airport", code: "IXJ", country: "India" },
  { city: "Jodhpur", name: "Jodhpur Airport", code: "JDH", country: "India" },
  { city: "Kannur", name: "Kannur International Airport", code: "CNN", country: "India" },
  {
    city: "Kochi",
    name: "Cochin International Airport",
    code: "COK",
    country: "India",
    aliases: ["Cochin"],
  },
  {
    city: "Kolkata",
    name: "Netaji Subhas Chandra Bose International Airport",
    code: "CCU",
    country: "India",
    aliases: ["Calcutta"],
  },
  { city: "Kozhikode", name: "Calicut International Airport", code: "CCJ", country: "India" },
  { city: "Leh", name: "Kushok Bakula Rimpochee Airport", code: "IXL", country: "India" },
  {
    city: "Lucknow",
    name: "Chaudhary Charan Singh International Airport",
    code: "LKO",
    country: "India",
  },
  { city: "Madurai", name: "Madurai International Airport", code: "IXM", country: "India" },
  { city: "Mangaluru", name: "Mangaluru International Airport", code: "IXE", country: "India" },
  {
    city: "Mumbai",
    name: "Chhatrapati Shivaji Maharaj International Airport",
    code: "BOM",
    country: "India",
    aliases: ["Bombay"],
  },
  { city: "Mysuru", name: "Mysore Airport", code: "MYQ", country: "India" },
  {
    city: "Nagpur",
    name: "Dr. Babasaheb Ambedkar International Airport",
    code: "NAG",
    country: "India",
  },
  { city: "Patna", name: "Jay Prakash Narayan Airport", code: "PAT", country: "India" },
  {
    city: "Port Blair",
    name: "Veer Savarkar International Airport",
    code: "IXZ",
    country: "India",
  },
  {
    city: "Prayagraj",
    name: "Prayagraj Airport",
    code: "IXD",
    country: "India",
    aliases: ["Allahabad"],
  },
  { city: "Pune", name: "Pune International Airport", code: "PNQ", country: "India" },
  { city: "Raipur", name: "Swami Vivekananda Airport", code: "RPR", country: "India" },
  { city: "Rajkot", name: "Rajkot International Airport", code: "HSR", country: "India" },
  { city: "Ranchi", name: "Birsa Munda Airport", code: "IXR", country: "India" },
  { city: "Shillong", name: "Shillong Airport", code: "SHL", country: "India" },
  { city: "Shimla", name: "Shimla Airport", code: "SLV", country: "India" },
  { city: "Srinagar", name: "Sheikh ul Alam International Airport", code: "SXR", country: "India" },
  { city: "Surat", name: "Surat International Airport", code: "STV", country: "India" },
  {
    city: "Thiruvananthapuram",
    name: "Trivandrum International Airport",
    code: "TRV",
    country: "India",
    aliases: ["Trivandrum"],
  },
  {
    city: "Tiruchirappalli",
    name: "Tiruchirappalli International Airport",
    code: "TRZ",
    country: "India",
  },
  { city: "Tirupati", name: "Tirupati Airport", code: "TIR", country: "India" },
  { city: "Udaipur", name: "Maharana Pratap Airport", code: "UDR", country: "India" },
  { city: "Vadodara", name: "Vadodara Airport", code: "BDQ", country: "India" },
  {
    city: "Varanasi",
    name: "Lal Bahadur Shastri International Airport",
    code: "VNS",
    country: "India",
    aliases: ["Benares"],
  },
  { city: "Vijayawada", name: "Vijayawada International Airport", code: "VGA", country: "India" },
  {
    city: "Visakhapatnam",
    name: "Visakhapatnam International Airport",
    code: "VTZ",
    country: "India",
  },
  {
    city: "Abu Dhabi",
    name: "Zayed International Airport",
    code: "AUH",
    country: "United Arab Emirates",
  },
  { city: "Amsterdam", name: "Amsterdam Airport Schiphol", code: "AMS", country: "Netherlands" },
  { city: "Bangkok", name: "Suvarnabhumi Airport", code: "BKK", country: "Thailand" },
  {
    city: "Colombo",
    name: "Bandaranaike International Airport",
    code: "CMB",
    country: "Sri Lanka",
  },
  { city: "Doha", name: "Hamad International Airport", code: "DOH", country: "Qatar" },
  {
    city: "Dubai",
    name: "Dubai International Airport",
    code: "DXB",
    country: "United Arab Emirates",
  },
  { city: "Frankfurt", name: "Frankfurt Airport", code: "FRA", country: "Germany" },
  { city: "Hong Kong", name: "Hong Kong International Airport", code: "HKG", country: "Hong Kong" },
  { city: "Istanbul", name: "Istanbul Airport", code: "IST", country: "Türkiye" },
  {
    city: "Kuala Lumpur",
    name: "Kuala Lumpur International Airport",
    code: "KUL",
    country: "Malaysia",
  },
  { city: "Kathmandu", name: "Tribhuvan International Airport", code: "KTM", country: "Nepal" },
  { city: "London", name: "Heathrow Airport", code: "LHR", country: "United Kingdom" },
  { city: "London", name: "Gatwick Airport", code: "LGW", country: "United Kingdom" },
  { city: "Male", name: "Velana International Airport", code: "MLE", country: "Maldives" },
  { city: "Muscat", name: "Muscat International Airport", code: "MCT", country: "Oman" },
  {
    city: "New York",
    name: "John F. Kennedy International Airport",
    code: "JFK",
    country: "United States",
  },
  {
    city: "New York",
    name: "Newark Liberty International Airport",
    code: "EWR",
    country: "United States",
  },
  { city: "Paris", name: "Charles de Gaulle Airport", code: "CDG", country: "France" },
  { city: "Paris", name: "Orly Airport", code: "ORY", country: "France" },
  { city: "Phuket", name: "Phuket International Airport", code: "HKT", country: "Thailand" },
  { city: "Rome", name: "Leonardo da Vinci–Fiumicino Airport", code: "FCO", country: "Italy" },
  {
    city: "San Francisco",
    name: "San Francisco International Airport",
    code: "SFO",
    country: "United States",
  },
  { city: "Seoul", name: "Incheon International Airport", code: "ICN", country: "South Korea" },
  { city: "Singapore", name: "Singapore Changi Airport", code: "SIN", country: "Singapore" },
  { city: "Sydney", name: "Sydney Kingsford Smith Airport", code: "SYD", country: "Australia" },
  { city: "Tokyo", name: "Haneda Airport", code: "HND", country: "Japan" },
  { city: "Tokyo", name: "Narita International Airport", code: "NRT", country: "Japan" },
  {
    city: "Toronto",
    name: "Toronto Pearson International Airport",
    code: "YYZ",
    country: "Canada",
  },
];

export function searchAirports(query: string, limit = 10): Airport[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return AIRPORTS.slice(0, limit);

  return AIRPORTS.map((airport, index) => {
    const city = airport.city.toLocaleLowerCase();
    const name = airport.name.toLocaleLowerCase();
    const code = airport.code.toLocaleLowerCase();
    const country = airport.country.toLocaleLowerCase();
    const aliases = airport.aliases?.map((alias) => alias.toLocaleLowerCase()) ?? [];
    const score =
      city === normalized || code === normalized || aliases.includes(normalized)
        ? 0
        : city.startsWith(normalized) ||
            code.startsWith(normalized) ||
            aliases.some((alias) => alias.startsWith(normalized))
          ? 1
          : name.startsWith(normalized)
            ? 2
            : city.includes(normalized) ||
                name.includes(normalized) ||
                aliases.some((alias) => alias.includes(normalized))
              ? 3
              : country.includes(normalized)
                ? 4
                : null;
    return { airport, index, score };
  })
    .filter((match) => match.score !== null)
    .sort((left, right) => left.score! - right.score! || left.index - right.index)
    .slice(0, limit)
    .map(({ airport }) => airport);
}
