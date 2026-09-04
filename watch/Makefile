KEY    := $(HOME)/.garmin/developer_key.der
JUNGLE := monkey.jungle
OUT    := build/SleepClick-$(DEVICE).prg
DEVICE := fr935
DEVICES := fr935 fr230
SDK    := $(HOME)/opt/connectiq-sdk/bin
PROPS  := resources/properties/properties.xml
TOKEN  := .token
# Monkey Types level 3 = strict: the compiler refuses to infer anything it was
# not told. The app builds clean at this level, so keep it here rather than as
# something to remember to pass by hand.
TYPECHECK := 3

.PHONY: build sim check deploy clean key token-help

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
	@$(SDK)/monkeyc -f $(JUNGLE) -o $(OUT) -y $(KEY) -d $(DEVICE) -w -l $(TYPECHECK); \
	  rc=$$?; \
	  if [ -f $(PROPS).bak ]; then mv $(PROPS).bak $(PROPS); fi; \
	  exit $$rc

# Load the app into an already-running ConnectIQ simulator. There is no
# separate simulator build: the device .prg is what monkeydo pushes across.
# (This target used to compile for a device id of "$(DEVICE)sim", which the
# compiler has never accepted — it always failed with "Invalid device id".)
sim: build
	@$(SDK)/monkeydo $(OUT) $(DEVICE)

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

# Build every supported device with warnings and strict type checking, without
# touching the token or the build/ output. The fr230 lines about deprecated
# AppBase.getProperty/setProperty are expected: on a Connect IQ 1.x device
# those are the only object store APIs that exist.
check:
	@rc=0; \
	for d in $(DEVICES); do \
	  echo "== $$d"; \
	  $(SDK)/monkeyc -f $(JUNGLE) -o /tmp/sleepclick-check-$$d.prg -y $(KEY) \
	    -d $$d -w -l $(TYPECHECK) || rc=1; \
	done; \
	rm -f /tmp/sleepclick-check-*.prg; \
	exit $$rc

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
