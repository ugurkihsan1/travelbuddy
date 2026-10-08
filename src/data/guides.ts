import type { GuideSection } from "../types";

export const guideSections: GuideSection[] = [
  {
    id: "istanbulkart",
    title: "One card, most of the city",
    subtitle: "Your first stop: an Istanbulkart machine",
    steps: [
      "Look for a yellow Biletmatik ticket machine at a major metro, tram or Marmaray station. Switch the screen to English and choose a visitor card offered by the machine.",
      "Buy the card, then add travel credit. The card purchase and your travel balance are separate costs. Check the price shown before paying.",
      "To top up, place your card on the reader, choose the amount and follow the machine instructions. Payment methods vary: some machines take cash, others also accept bank cards.",
      "Tap your card at the gate or onboard reader for each ride. Keep it handy for transfers; a new journey may deduct another fare.",
    ],
    tips: [
      "A standard visitor or anonymous card does not automatically include benefits offered to personalized cards, such as eligible transfer discounts or holiday travel.",
      "Keep some Turkish lira as a backup. Do not assume every machine accepts your bank card or gives change.",
      "Fares and card availability can change. The machine or station display is the final price; route prices in this app are planning estimates.",
    ],
    sourceUrl: "https://www.istanbulkart.istanbul/",
    sourceLabel: "Official Istanbulkart website",
  },
  {
    id: "metro-tram",
    title: "Find your way by rail",
    subtitle: "A simple way to avoid traffic",
    steps: [
      "For Sultanahmet, Gülhane, Eminönü and Karaköy, look for the T1 tram. The signs show the final destination, so check your direction before boarding.",
      "Use M2 for central stops including Taksim and Şişhane. F1 links Taksim with Kabataş; the stations at each end connect you to other routes.",
      "Follow the route color and line code, then check the platform destination. Onboard displays and announcements identify the next stop.",
      "When changing lines, follow transfer signs and allow time for walks, stairs and a possible second gate. Each operator or transfer can have separate fare rules.",
    ],
    tips: [
      "Prefer rail during busy road traffic. The estimated journey time includes walking to the station, so a nearby direct tram can be better than a distant metro.",
      "Operating hours, accessibility and service disruptions vary by line. Check station displays before starting a late journey.",
    ],
    sourceUrl: "https://www.metro.istanbul/",
    sourceLabel: "Official Metro Istanbul website",
  },
  {
    id: "marmaray",
    title: "Cross the Bosphorus with Marmaray",
    subtitle: "An underground connection between continents",
    steps: [
      "From the historic European center, head to Sirkeci station. For the Asian side, follow the eastbound direction toward Gebze; Üsküdar and Ayrılık Çeşmesi are useful stops along the way. Confirm your stop and train destination on the display.",
      "Üsküdar is useful for its waterfront. Ayrılık Çeşmesi connects to the M4 metro, which serves Kadıköy and Sabiha Gökçen Airport.",
      "Have enough credit before entering: Marmaray uses a distance-based fare system and the entry deduction can be higher than the fare for your short journey.",
      "After exiting, look for refund-machine instructions. Refunds and eligibility depend on the card type and current rules; a visitor or anonymous card may not qualify.",
    ],
    tips: [
      "A ferry is a scenic alternative when its departure point and timetable suit your trip. Marmaray is often practical when road traffic is heavy.",
      "The Bosphorus rail crossing has no view of the water. Save a waterfront walk or ferry ride for the scenery.",
    ],
    sourceUrl: "https://marmaray.gov.tr/",
    sourceLabel: "Official Marmaray website",
  },
  {
    id: "ferries",
    title: "Let the ferry be part of the visit",
    subtitle: "Waterfront piers, city views and an easy crossing",
    steps: [
      "Look for Şehir Hatları piers at Eminönü, Karaköy, Beşiktaş, Üsküdar or Kadıköy. Different piers can serve different destinations, even on the same waterfront.",
      "Read the destination and departure time on the pier display before tapping through. Choose the next suitable sailing and leave time to walk to the correct pier.",
      "Follow the boarding queue and keep your card ready. Most regular city services accept Istanbulkart; sightseeing cruises and private services can use different tickets.",
      "On arrival, use the pier name to confirm where you are before following the next walking leg.",
    ],
    tips: [
      "Wind and weather can disrupt sailings. Check the pier display for cancellations before relying on a connection.",
      "Departures vary by route, day and season. A waterfront pier can have several entrances, so leave time to find the right one.",
    ],
    sourceUrl: "https://sehirhatlari.istanbul/",
    sourceLabel: "Official Şehir Hatları website",
  },
  {
    id: "taxi",
    title: "Take a taxi with a clear plan",
    subtitle: "Useful for luggage or a difficult final stretch",
    steps: [
      "Use a licensed taxi from an official rank or a reputable booking service. Check the vehicle and driver details when booking.",
      "Show the destination name and map pin before the journey. Ask the driver to use the meter and confirm how you will pay.",
      "Pay in Turkish lira and request a receipt. Check your notes when handing over cash; agree on any payment issue before setting off.",
      "Keep extra time and budget for traffic. Bridge, tunnel or road tolls may add to the meter total, and different taxi classes have different tariffs.",
    ],
    tips: [
      "The app gives an indicative range, never a guaranteed taxi quote. A longer wait in traffic can increase the fare.",
      "For a cross-Bosphorus trip, compare Marmaray or a direct ferry before choosing a taxi.",
    ],
    sourceUrl: "https://tuhim.ibb.gov.tr/",
    sourceLabel: "Official Istanbul transport regulation website",
  },
  {
    id: "bus",
    title: "Catch a bus with confidence",
    subtitle: "Match the stop, line and destination",
    steps: [
      "At the stop, check its name or stop code and the route direction. Stops across the street usually serve the opposite direction.",
      "Match the bus line code and destination display to your journey before boarding. Tap your Istanbulkart on the reader near the entrance.",
      "Use onboard displays or your map to follow the journey. Press the stop button before your stop and leave by the designated exit.",
      "Refresh the arrivals panel for the selected stop. If live arrivals are not connected or the service is stale, no reliable countdown is available.",
    ],
    tips: [
      "Traffic affects bus arrival times. Live predictions are estimates and can change as the vehicle approaches.",
      "Use the stop code printed at the bus stop when looking up arrivals. A neighborhood name may refer to several different stops.",
    ],
    sourceUrl: "https://iett.istanbul/",
    sourceLabel: "Official IETT website",
  },
  {
    id: "arrival",
    title: "Start smoothly after landing",
    subtitle: "Know which airport you are arriving at",
    steps: [
      "Istanbul Airport (IST) is on the European side. Follow airport signs for public transport; the M11 metro serves the airport, and you may need a transfer for your accommodation.",
      "Sabiha Gökçen Airport (SAW) is on the Asian side. The M4 metro connects the airport to Kadıköy, with a Marmaray transfer at Ayrılık Çeşmesi.",
      "Choose a signed official airport coach or taxi rank if rail does not fit your arrival time, luggage or accommodation. Confirm the current destination and ticket price before boarding.",
      "Save your accommodation name, address and map pin offline. Your first travel day can be shorter after a flight; use a relaxed pace if needed.",
    ],
    tips: [
      "The airports are far apart. Match the airport code on your ticket before planning a transfer.",
      "Airport rail, coaches and taxi prices are separate from the city estimates in this app. Timetables and transfers can change.",
    ],
    sourceUrl: "https://www.metro.istanbul/",
    sourceLabel: "Official Metro Istanbul website",
  },
  {
    id: "everyday",
    title: "A few things that make the day easier",
    subtitle: "Comfort, etiquette and useful essentials",
    steps: [
      "Wear comfortable shoes: Istanbul has steep streets, uneven paving and long station corridors. Carry drinking water and allow breaks.",
      "For mosque visits, cover shoulders and knees, remove shoes where requested, and bring a head covering if needed. Respect prayer times and follow the visitor signs.",
      "Keep valuables secure in crowded trams, markets and queues. Use the accommodation safe for documents you do not need during the day.",
      "For an urgent medical, fire or police emergency, call 112. Keep your accommodation address and a downloaded copy of your trip accessible.",
    ],
    tips: [
      "Pay in Turkish lira. Check the final amount and currency before accepting a card terminal payment.",
      "Museum entry, reservation requirements and opening hours change. Ticket counters and official venue notices take precedence over a saved itinerary.",
    ],
    sourceUrl: "https://www.112.gov.tr/",
    sourceLabel: "Official Turkish emergency service website",
  },
];

export const travelTips: { title: string; body: string }[] = [
  {
    title: "Tap, then explore",
    body: "Get an Istanbulkart at a station Biletmatik machine. Keep enough credit for your next ride and remember that card benefits vary by type.",
  },
  {
    title: "Cross without the traffic",
    body: "Sirkeci to Üsküdar is a useful Marmaray connection. A ferry adds waterfront views when its timetable fits.",
  },
  {
    title: "Make room for a detour",
    body: "Mark a stop visited or skipped, or add a place you discover. Your remaining route can adapt around it.",
  },
  {
    title: "Keep estimates in perspective",
    body: "Travel costs are indicative. Station fares, ticket counters and the taxi meter determine what you actually pay.",
  },
];
