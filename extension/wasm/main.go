package main

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"math/big"
	"regexp"
	"strings"
	"syscall/js"
)

// BioLink represents an external link in bio
type BioLink struct {
	Title string `json:"title"`
	URL   string `json:"url"`
}

// Profile represents Instagram user profile details
type Profile struct {
	PK             string    `json:"pk"`
	Username       string    `json:"username"`
	FullName       string    `json:"full_name"`
	Biography      string    `json:"biography"`
	ExternalURL    string    `json:"external_url"`
	BioLinks       []BioLink `json:"bio_links"`
	ProfilePicURL  string    `json:"profile_pic_url"`
	FollowerCount  int       `json:"follower_count"`
	FollowingCount int       `json:"following_count"`
	MediaCount     int       `json:"media_count"`
	PublicEmail    string    `json:"public_email"`
	PublicPhone    string    `json:"public_phone"`
	IsPrivate      bool      `json:"is_private"`
	IsVerified     bool      `json:"is_verified"`
	IsBusiness     bool      `json:"is_business"`
	Category       string    `json:"category"`
	City           string    `json:"city"`
	Address        string    `json:"address"`
	ProfileURL     string    `json:"profile_url"`
}

// Regex to find emails inside bios if not in public_email
var emailRegex = regexp.MustCompile(`[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}`)
var phoneRegex = regexp.MustCompile(`(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}`)

// formatProfile parses and enriches profile data supporting both Web and Mobile API structures
func formatProfile(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return js.ValueOf(map[string]interface{}{"error": "missing arguments"})
	}

	rawJSON := args[0].String()
	var rawData map[string]interface{}
	if err := json.Unmarshal([]byte(rawJSON), &rawData); err != nil {
		return js.ValueOf(map[string]interface{}{"error": err.Error()})
	}

	user, ok := rawData["user"].(map[string]interface{})
	if !ok {
		user = rawData
	}

	// 1. Resolve ID / PK
	pk := getStr(user, "pk")
	if pk == "" {
		pk = getStr(user, "id")
	}

	// 2. Resolve Counts (Web Profile edge structure vs Mobile API count fields)
	followerCount := getInt(user, "follower_count")
	if followerCount == 0 {
		if edge, ok := user["edge_followed_by"].(map[string]interface{}); ok {
			followerCount = getInt(edge, "count")
		}
	}

	followingCount := getInt(user, "following_count")
	if followingCount == 0 {
		if edge, ok := user["edge_follow"].(map[string]interface{}); ok {
			followingCount = getInt(edge, "count")
		}
	}

	mediaCount := getInt(user, "media_count")
	if mediaCount == 0 {
		if edge, ok := user["edge_owner_to_timeline_media"].(map[string]interface{}); ok {
			mediaCount = getInt(edge, "count")
		}
	}

	// 3. Resolve Avatar (HD vs Regular)
	profilePic := getStr(user, "profile_pic_url_hd")
	if profilePic == "" {
		profilePic = getStr(user, "profile_pic_url")
	}
	if profilePic == "" {
		if hd, ok := user["hd_profile_pic_url_info"].(map[string]interface{}); ok {
			profilePic = getStr(hd, "url")
		}
	}

	// 4. Resolve External URL & All Bio Links
	extURL := getStr(user, "external_url")
	var bioLinksList []BioLink
	if links, ok := user["bio_links"].([]interface{}); ok {
		for _, l := range links {
			if lm, ok := l.(map[string]interface{}); ok {
				t := getStr(lm, "title")
				u := getStr(lm, "url")
				if u != "" {
					if t == "" {
						t = "Link"
					}
					bioLinksList = append(bioLinksList, BioLink{Title: t, URL: u})
				}
			}
		}
	}
	if len(bioLinksList) == 0 && extURL != "" {
		bioLinksList = append(bioLinksList, BioLink{Title: "Website", URL: extURL})
	}
	if extURL == "" && len(bioLinksList) > 0 {
		extURL = bioLinksList[0].URL
	}

	// 5. Category & Business
	category := getStr(user, "category_name")
	if category == "" {
		category = getStr(user, "category")
	}
	isBusiness := getBool(user, "is_business_account")
	if !isBusiness {
		isBusiness = getBool(user, "is_business")
	}

	p := Profile{
		PK:             pk,
		Username:       getStr(user, "username"),
		FullName:       getStr(user, "full_name"),
		Biography:      getStr(user, "biography"),
		ExternalURL:    extURL,
		BioLinks:       bioLinksList,
		ProfilePicURL:  profilePic,
		FollowerCount:  followerCount,
		FollowingCount: followingCount,
		MediaCount:     mediaCount,
		PublicEmail:    getStr(user, "public_email"),
		PublicPhone:    getStr(user, "public_phone_number"),
		IsPrivate:      getBool(user, "is_private"),
		IsVerified:     getBool(user, "is_verified"),
		IsBusiness:     isBusiness,
		Category:       category,
		City:           getStr(user, "city_name"),
		Address:        getStr(user, "address_street"),
		ProfileURL:     "https://instagram.com/" + getStr(user, "username"),
	}

	// Auto-extract email from bio if public_email is empty
	if p.PublicEmail == "" && p.Biography != "" {
		if match := emailRegex.FindString(p.Biography); match != "" {
			p.PublicEmail = match
		}
	}

	// Auto-extract phone from bio if public_phone is empty
	if p.PublicPhone == "" && p.Biography != "" {
		if match := phoneRegex.FindString(p.Biography); match != "" {
			p.PublicPhone = match
		}
	}

	resBytes, _ := json.Marshal(p)
	return js.ValueOf(string(resBytes))
}

// generateCSV converts an array of user profile objects into a CSV string
func generateCSV(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return js.ValueOf("")
	}

	rawJSON := args[0].String()
	var profiles []Profile
	if err := json.Unmarshal([]byte(rawJSON), &profiles); err != nil {
		return js.ValueOf(fmt.Sprintf("error: %v", err))
	}

	var sb strings.Builder
	writer := csv.NewWriter(&sb)

	// CSV Header
	writer.Write([]string{
		"Username",
		"Full Name",
		"Email",
		"Phone",
		"Followers",
		"Following",
		"Posts",
		"Website",
		"Category",
		"Profile URL",
		"Bio",
	})

	for _, p := range profiles {
		cleanBio := strings.ReplaceAll(p.Biography, "\n", " ")
		writer.Write([]string{
			p.Username,
			p.FullName,
			p.PublicEmail,
			p.PublicPhone,
			fmt.Sprintf("%d", p.FollowerCount),
			fmt.Sprintf("%d", p.FollowingCount),
			fmt.Sprintf("%d", p.MediaCount),
			p.ExternalURL,
			p.Category,
			p.ProfileURL,
			cleanBio,
		})
	}

	writer.Flush()
	return js.ValueOf(sb.String())
}

// filterLeads filters a list of profiles based on criteria
func filterLeads(this js.Value, args []js.Value) interface{} {
	if len(args) < 2 {
		return js.ValueOf("[]")
	}

	usersJSON := args[0].String()
	filterJSON := args[1].String()

	var profiles []Profile
	if err := json.Unmarshal([]byte(usersJSON), &profiles); err != nil {
		return js.ValueOf("[]")
	}

	var filter struct {
		HasEmail     bool `json:"has_email"`
		HasPhone     bool `json:"has_phone"`
		HasWebsite   bool `json:"has_website"`
		MinFollowers int  `json:"min_followers"`
		MaxFollowers int  `json:"max_followers"`
		OnlyVerified bool `json:"only_verified"`
	}
	_ = json.Unmarshal([]byte(filterJSON), &filter)

	var filtered []Profile
	for _, p := range profiles {
		if filter.HasEmail && p.PublicEmail == "" {
			continue
		}
		if filter.HasPhone && p.PublicPhone == "" {
			continue
		}
		if filter.HasWebsite && p.ExternalURL == "" {
			continue
		}
		if filter.OnlyVerified && !p.IsVerified {
			continue
		}
		if filter.MinFollowers > 0 && p.FollowerCount < filter.MinFollowers {
			continue
		}
		if filter.MaxFollowers > 0 && p.FollowerCount > filter.MaxFollowers {
			continue
		}
		filtered = append(filtered, p)
	}

	resBytes, _ := json.Marshal(filtered)
	return js.ValueOf(string(resBytes))
}

// resolveMediaID converts shortcode or Instagram post URL to Media ID
func resolveMediaID(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return js.ValueOf("")
	}
	input := strings.TrimSpace(args[0].String())

	if strings.Contains(input, "instagram.com") || strings.Contains(input, "http://") || strings.Contains(input, "https://") {
		if idx := strings.Index(input, "?"); idx != -1 {
			input = input[:idx]
		}
		parts := strings.Split(input, "/")
		for i, part := range parts {
			part = strings.TrimSpace(part)
			if part == "p" || part == "reels" || part == "reel" || part == "tv" {
				if i+1 < len(parts) && parts[i+1] != "" {
					input = parts[i+1]
					break
				}
			}
		}
	}

	isNumeric := true
	for i := 0; i < len(input); i++ {
		if input[i] < '0' || input[i] > '9' {
			isNumeric = false
			break
		}
	}

	if !isNumeric && len(input) > 0 {
		alphabet := "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
		id := big.NewInt(0)
		base := big.NewInt(64)
		for i := 0; i < len(input); i++ {
			char := input[i]
			idx := strings.IndexByte(alphabet, char)
			if idx == -1 {
				continue
			}
			id.Mul(id, base)
			id.Add(id, big.NewInt(int64(idx)))
		}
		return js.ValueOf(id.String())
	}

	return js.ValueOf(input)
}

// getVersion returns version info
func getVersion(this js.Value, args []js.Value) interface{} {
	return js.ValueOf("Go-WASM Instagram Engine v1.0.0 (High Performance)")
}

// Helper functions for parsing
func getStr(m map[string]interface{}, key string) string {
	if val, ok := m[key]; ok && val != nil {
		if s, ok := val.(string); ok {
			return strings.TrimSpace(s)
		}
	}
	return ""
}

func getInt(m map[string]interface{}, key string) int {
	if val, ok := m[key]; ok && val != nil {
		if num, ok := val.(float64); ok {
			return int(num)
		}
	}
	return 0
}

func getBool(m map[string]interface{}, key string) bool {
	if val, ok := m[key]; ok && val != nil {
		if b, ok := val.(bool); ok {
			return b
		}
	}
	return false
}

func main() {
	c := make(chan struct{}, 0)

	// Register JS Global functions exposed by Go WebAssembly
	js.Global().Set("instaWasmFormatProfile", js.FuncOf(formatProfile))
	js.Global().Set("instaWasmGenerateCSV", js.FuncOf(generateCSV))
	js.Global().Set("instaWasmFilterLeads", js.FuncOf(filterLeads))
	js.Global().Set("instaWasmResolveMediaID", js.FuncOf(resolveMediaID))
	js.Global().Set("instaWasmGetVersion", js.FuncOf(getVersion))

	fmt.Println("🚀 Go WebAssembly (Wasm) Engine Initialized Successfully!")
	<-c
}
