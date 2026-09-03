KEY    := $(HOME)/.garmin/developer_key.der
JUNGLE := monkey.jungle
OUT    := build/SleepClick-$(DEVICE).prg
DEVICE := fr935
SDK    := $(HOME)/opt/connectiq-sdk/bin
PROPS  := resources/properties/properties.xml
TOKEN  := .token

.PHONY: build sim deploy clean key token-help

# Garmin Connect only exposes app settings for store-installed apps, so a
# sideloaded build has no way to receive the sync token at runtime. If a
# .token file is present it is baked into the build instead. That file is
# gitignored, and properties.xml is restored afterwards even when the build
# fails, so the secret never reaches a tracked file.
define with_token
	@if [ -f $(TOKEN) ]; then \
	  cp $(PROPS) $(PROPS).bak; \
	  tok=$$(tr -d ' \t\n\r' < $(TOKEN)); \
	  sed -i "s|\(id=\"syncToken\" type=\"string\"\)></property>|\1>$$tok</property>|" $(PROPS); \
	  echo "Token vložený z $(TOKEN) (do gitu sa nedostane)"; \
	else \
	  echo "Bez $(TOKEN) — appka sa zostaví s prázdnym tokenom a synchronizovať nebude."; \
	fi
endef

define restore_props
	@if [ -f $(PROPS).bak ]; then mv $(PROPS).bak $(PROPS); fi
endef

build:
	@mkdir -p build
	$(call with_token)
	@$(SDK)/monkeyc -f $(JUNGLE) -o $(OUT) -y $(KEY) -d $(DEVICE) -w; \
	  rc=$$?; \
	  if [ -f $(PROPS).bak ]; then mv $(PROPS).bak $(PROPS); fi; \
	  exit $$rc

sim:
	@mkdir -p build
	$(call with_token)
	@$(SDK)/monkeyc -f $(JUNGLE) -o $(OUT) -y $(KEY) -d $(DEVICE)sim -w; \
	  rc=$$?; \
	  if [ -f $(PROPS).bak ]; then mv $(PROPS).bak $(PROPS); fi; \
	  exit $$rc

deploy: build
	@MOUNT=$$(ls -d /media/$$USER/GARMIN /run/media/$$USER/GARMIN /media/GARMIN 2>/dev/null | head -1); \
	if [ -z "$$MOUNT" ]; then \
	  echo "Hodinky nie sú pripojené (hľadal som /media/$$USER/GARMIN a /run/media/$$USER/GARMIN)."; \
	  echo "Skontroluj, že sú v režime USB mass storage: lsblk -o NAME,LABEL,MOUNTPOINT | grep -i garmin"; \
	  exit 1; \
	fi; \
	test -d "$$MOUNT/GARMIN/APPS" || { echo "Na $$MOUNT chýba GARMIN/APPS — je to naozaj disk hodiniek?"; exit 1; }; \
	cp $(OUT) $$MOUNT/GARMIN/APPS/; \
	sync; \
	echo "Nahraté: $(OUT) -> $$MOUNT/GARMIN/APPS/"

token-help:
	@echo "Token vydaj v admine na https://sleep.kozliatko.sk/admin a ulož ho:"
	@echo "  echo '<token>' > watch/.token"
	@echo "Potom: make build DEVICE=fr935"

clean:
	rm -rf build
	@rm -f $(PROPS).bak

key:
	@mkdir -p $(HOME)/.garmin
	@if [ -f $(KEY) ]; then echo "Kluč už existuje: $(KEY)"; exit 0; fi
	openssl genrsa -out $(HOME)/.garmin/developer_key.pem 4096
	openssl pkcs8 -topk8 -inform PEM -outform DER \
	  -in $(HOME)/.garmin/developer_key.pem -out $(KEY) -nocrypt
	@echo "Kluč vygenerovaný: $(KEY)"
